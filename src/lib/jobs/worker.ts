import { randomUUID } from "node:crypto";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import sharp from "sharp";
import { ComfyClient, ComfyError } from "../comfy/client.ts";
import { outputImage, runPrompt } from "../comfy/run.ts";
import { type Config, getConfig } from "../config.ts";
import { AppError, type ErrorCode } from "../errors.ts";
import { buildPrompt } from "../prompt.ts";
import { removeExpired, writeStored } from "../storage.ts";
import { buildT2I } from "../workflow/build.ts";
import { type ApiGraph, findNodeId } from "../workflow/graph.ts";
import { loadTemplate } from "../workflow/templates.ts";
import { type JobData, type JobResult, QUEUE_NAME, cancelKey, createRedis } from "./queue.ts";

type Shared = { worker?: Worker<JobData, JobResult>; cleanup?: NodeJS.Timeout };
const holder = globalThis as typeof globalThis & { __bigosWorker?: Shared };
const shared: Shared = (holder.__bigosWorker ??= {});

const CLEANUP_EVERY_MS = 3_600_000;

export function resultName(jobId: string): string {
  return `${jobId}.png`;
}

function toErrorCode(err: unknown, cancelled: boolean): ErrorCode {
  if (cancelled) return "cancelled";
  if (err instanceof AppError) return err.code;
  if (err instanceof ComfyError) {
    if (err.kind === "unavailable") return "comfy_unavailable";
    if (err.kind === "timeout") return "timeout";
    return "generation_failed";
  }
  return "unexpected";
}

/**
 * The model always returns RGBA, but without "Fundo transparente" the alpha is only noise
 * (values ~204–255, spec §14). Opaque results get the alpha channel dropped; transparent ones
 * are delivered as the original PNG (spec §8.2).
 */
export async function finalizeImage(png: Buffer, transparent: boolean) {
  if (transparent) {
    const meta = await sharp(png).metadata();
    return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const { data, info } = await sharp(png).removeAlpha().png().toBuffer({ resolveWithObject: true });
  return { png: data, width: info.width, height: info.height };
}

async function buildGraph(data: JobData): Promise<ApiGraph> {
  const prompt = buildPrompt(data.prompt, data.transparentBackground);
  if (data.workflow === "t2i" && data.size) {
    return buildT2I(loadTemplate("t2i"), { prompt, ...data.size, seed: data.seed, steps: data.steps });
  }
  throw new AppError("not_supported_yet", 501);
}

async function processJob(
  job: Job<JobData, JobResult>,
  client: ComfyClient,
  config: Config,
  redis: ReturnType<typeof createRedis>,
): Promise<JobResult> {
  const id = job.id as string;
  const controller = new AbortController();
  const isCancelled = async () => (await redis.exists(cancelKey(id))) > 0;
  const watcher = setInterval(() => {
    isCancelled()
      .then((yes) => yes && controller.abort())
      .catch(() => {});
  }, 1_000);

  try {
    if (await isCancelled()) throw new ComfyError("interrupted", "cancelled before start");
    const graph = await buildGraph(job.data);
    const { entry } = await runPrompt(client, graph, {
      timeoutMs: config.jobTimeoutMs,
      knownPromptId: job.data.promptId,
      onPromptId: (promptId) => job.updateData({ ...job.data, promptId }),
      onProgress: (progress) => void job.updateProgress(progress).catch(() => {}),
      signal: controller.signal,
    });
    const raw = await client.view(outputImage(entry, findNodeId(graph, "@save")));
    const image = await finalizeImage(raw, job.data.transparentBackground);
    await writeStored(config, "results", resultName(id), image.png);
    return {
      width: image.width,
      height: image.height,
      transparent: job.data.transparentBackground,
      warnings: [],
    };
  } catch (err) {
    const code = toErrorCode(err, controller.signal.aborted || (await isCancelled().catch(() => false)));
    if (code !== "cancelled") console.error(`[worker] job ${id} failed (${code})`, err);
    throw new UnrecoverableError(code);
  } finally {
    clearInterval(watcher);
  }
}

/** Starts the single queue worker and the storage cleanup once per server process. */
export function startBackground(): void {
  if (shared.worker) return;
  const config = getConfig();
  const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-${randomUUID()}` });
  const redis = createRedis(true);

  shared.worker = new Worker<JobData, JobResult>(
    QUEUE_NAME,
    (job) => processJob(job, client, config, redis),
    { connection: createRedis(true), concurrency: 1, lockDuration: 60_000 },
  );
  shared.worker.on("error", (err) => console.error("[worker] error", err));

  const cleanup = () =>
    removeExpired(config)
      .then((n) => n > 0 && console.log(`[storage] removed ${n} expired files`))
      .catch((err) => console.error("[storage] cleanup failed", err));
  void cleanup();
  shared.cleanup = setInterval(cleanup, CLEANUP_EVERY_MS);
  console.log(`[worker] started; ComfyUI at ${config.comfyUrl}`);
}
