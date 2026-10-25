import { randomUUID } from "node:crypto";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import sharp from "sharp";
import { ComfyClient, ComfyError } from "../comfy/client.ts";
import { outputAudio, outputImage, outputVideo, runPrompt } from "../comfy/run.ts";
import { type Config, getConfig } from "../config.ts";
import { type EffectImages, finalizeEffectText, finalizeMusicCaption, finalizePrompt, finalizeVideoPrompt } from "../enhance.ts";
import { EFFECTS, type EffectText, fallbackEffectText } from "../effects.ts";
import { mp3Duration } from "../audio.ts";
import { buildMusicCaption } from "../music.ts";
import { AppError, type Detail, type ErrorCode } from "../errors.ts";
import { buildPrompt } from "../prompt.ts";
import { removeExpired, storageFile, writeStored } from "../storage.ts";
import {
  type SentImage,
  type VideoUploadMeta,
  fitToBudget,
  readUploadFrame,
  readUploadImage,
  readUploadMeta,
  readUploadVideo,
} from "../uploads.ts";
import { buildVideoPrompt, tokensToSubjects } from "../video.ts";
import { FfmpegError, probe } from "../ffmpeg.ts";
import { readTapeMeta, tapeFile } from "../tapes.ts";
import { buildEdit, buildEffect, buildMusic, buildT2I, buildVideo } from "../workflow/build.ts";
import { removeWork, runRestore } from "./restore.ts";
import { type ApiGraph, findNodeId } from "../workflow/graph.ts";
import { loadTemplate } from "../workflow/templates.ts";
import { type JobData, type JobResult, type Media, QUEUE_NAME, cancelKey, createRedis } from "./queue.ts";

type Shared = { worker?: Worker<JobData, JobResult>; cleanup?: NodeJS.Timeout };
const holder = globalThis as typeof globalThis & { __bigosWorker?: Shared };
const shared: Shared = (holder.__bigosWorker ??= {});

const CLEANUP_EVERY_MS = 3_600_000;

const EXTENSIONS: Record<Media, string> = { image: "png", video: "mp4", audio: "mp3" };

export function resultName(jobId: string, media: Media = "image"): string {
  return `${jobId}.${EXTENSIONS[media]}`;
}

function toErrorCode(err: unknown, cancelled: boolean): ErrorCode {
  if (cancelled) return "cancelled";
  if (err instanceof AppError) return err.code;
  // ffmpeg failing on a restoration (a damaged capture, a chunk with missing frames).
  if (err instanceof FfmpegError) return "generation_failed";
  if (err instanceof ComfyError) {
    if (err.kind === "unavailable") return "comfy_unavailable";
    if (err.kind === "timeout") return "timeout";
    if (/out of memory|exceed allowed memory/i.test(err.message)) return "out_of_memory";
    return "generation_failed";
  }
  return "unexpected";
}

/** Minimum share of fully transparent pixels (alpha < 16) to call a result transparent (spec §13). */
export const MIN_TRANSPARENT_SHARE = 0.05;

/** Share of pixels with alpha < 16; 0 when the image has no alpha channel. */
export async function transparentShare(png: Buffer): Promise<number> {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return 0;
  const alpha = await sharp(png).extractChannel(3).raw().toBuffer();
  let clear = 0;
  for (const a of alpha) if (a < 16) clear++;
  return clear / alpha.length;
}

/**
 * The model always returns RGBA, but without a transparent background the alpha is only noise
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

/**
 * Final LLM pass (spec §14, decision 24): English, <imageN> references, style up front. When the
 * LLM is missing, down or unusable, the generation goes on with the fallback (style appended).
 */
export async function resolvePrompt(
  data: Pick<JobData, "text" | "style" | "fallbackPrompt" | "images">,
  llm: Config["llm"],
  finalize: typeof finalizePrompt = finalizePrompt,
): Promise<string> {
  if (!llm || data.text.length > llm.maxInputChars) return data.fallbackPrompt;
  try {
    return await finalize(llm, data.text, data.style, data.images.length);
  } catch (err) {
    console.warn("[worker] final prompt pass failed, using the fallback", err instanceof Error ? err.message : err);
    return data.fallbackPrompt;
  }
}

/**
 * Video final pass (spec §14, decision 28): the LLM writes the English description, the sounds and
 * the music; the MiniMax prompt layout is ours. Falls back like images do.
 */
export async function resolveVideoPrompt(
  data: Pick<JobData, "text" | "style" | "fallbackPrompt" | "images">,
  llm: Config["llm"],
  finalize: typeof finalizeVideoPrompt = finalizeVideoPrompt,
): Promise<string> {
  if (!llm || data.text.length > llm.maxInputChars) return data.fallbackPrompt;
  try {
    const parts = await finalize(llm, data.text, data.style, data.images.length);
    return buildVideoPrompt({
      description: tokensToSubjects(parts.description),
      soundscape: parts.soundscape,
      music: parts.music,
      references: data.images.length,
    });
  } catch (err) {
    console.warn("[worker] final video prompt pass failed, using the fallback", err instanceof Error ? err.message : err);
    return data.fallbackPrompt;
  }
}

/**
 * Music final pass (spec §14, decision 30): the description (+ genre) becomes the caption layout
 * MiniMax Music 3 was trained on. The lyrics are not touched here. Falls back like the others.
 */
export async function resolveMusicPrompt(
  data: Pick<JobData, "text" | "style" | "fallbackPrompt" | "music">,
  llm: Config["llm"],
  finalize: typeof finalizeMusicCaption = finalizeMusicCaption,
): Promise<string> {
  if (!llm || data.text.length > llm.maxInputChars) return data.fallbackPrompt;
  try {
    return buildMusicCaption(await finalize(llm, data.text, data.style, data.music?.instrumental ?? false));
  } catch (err) {
    console.warn("[worker] final music prompt pass failed, using the fallback", err instanceof Error ? err.message : err);
    return data.fallbackPrompt;
  }
}

/**
 * Effects' vision pass (spec §14, decision 31): the LLM sees the first frame and the photo and
 * writes the English texts of the effect's graph. Without the LLM, the frame (remove/face swap)
 * or a usable reply, the generic texts of fallbackEffectText are used.
 */
export async function resolveEffectText(
  data: Pick<JobData, "text" | "effect">,
  llm: Config["llm"],
  images: EffectImages,
  finalize: typeof finalizeEffectText = finalizeEffectText,
): Promise<EffectText> {
  if (!data.effect) throw new AppError("invalid_request", 400);
  const fallback = fallbackEffectText(data.effect.id, data.text);
  const needsFrame = data.effect.id === "remove_people" || data.effect.id === "face_swap";
  if (!llm || data.text.length > llm.maxInputChars || (needsFrame && !images.frame)) return fallback;
  try {
    return await finalize(llm, data.effect.id, data.text, images);
  } catch (err) {
    console.warn("[worker] effect vision pass failed, using the fallback", err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** A PNG as a small JPEG data URL for the vision pass (768 px is plenty to describe a scene). */
async function toDataUrl(png: Buffer | null): Promise<string | null> {
  if (!png) return null;
  const jpeg = await sharp(png).resize(768, 768, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function effectImages(data: JobData, config: Config): Promise<EffectImages> {
  const frame = data.effect?.hasFrame ? await readUploadFrame(config, data.effect.video) : null;
  const photo = data.images[0] ? await readUploadImage(config, data.images[0]) : null;
  return { frame: await toDataUrl(frame), photo: await toDataUrl(photo) };
}

const isVideo = <T extends Pick<JobData, "workflow">>(data: T): data is T & { workflow: "video_fl2va" | "video_ref2va" } =>
  data.workflow === "video_fl2va" || data.workflow === "video_ref2va";

const isEffect = (data: Pick<JobData, "effect">) => data.effect !== undefined;

/**
 * Restoration job (spec §14, decision 32): no prompt, no single graph — the pipeline in restore.ts
 * runs ffmpeg locally and, for the upscale, one ComfyUI prompt per chunk.
 */
async function processRestore(
  job: Job<JobData, JobResult>,
  client: ComfyClient,
  config: Config,
  signal: AbortSignal,
): Promise<JobResult> {
  const id = job.id as string;
  const plan = job.data.restore;
  const tape = plan ? await readTapeMeta(config, plan.upload) : null;
  if (!plan || !tape) throw new AppError("upload_not_found", 400);
  // The cleanup alone runs here, without the GPU: only the upscale needs ComfyUI awake.
  if (plan.mode === "upscale" && !(await client.waitUntilAwake(config.comfyWakeMs))) {
    throw new ComfyError("unavailable", `ComfyUI did not wake up within ${config.comfyWakeMs / 1000}s`);
  }
  const out = storageFile(config, "results", resultName(id, "video"));
  let bestShare = 0;
  await runRestore(
    {
      jobId: id,
      file: tapeFile(config, tape),
      info: tape.info,
      measurements: tape.measurements,
      section: { start: plan.start, seconds: plan.seconds, color: plan.color, mode: plan.mode },
      state: plan.state,
    },
    {
      client,
      config,
      template: () => loadTemplate("restore_seedvr2"),
      signal,
      onProgress: (share) => {
        if (share <= bestShare) return;
        bestShare = share;
        void job.updateProgress({ phase: "running", value: Math.round(share * 1000), max: 1000 }).catch(() => {});
      },
      saveState: async (state) => {
        const restore = job.data.restore;
        if (restore) await job.updateData({ ...job.data, restore: { ...restore, state } });
      },
    },
    out,
  );
  await removeWork(config, id);
  const result = await probe(out);
  return {
    width: result?.width ?? 0,
    height: result?.height ?? 0,
    transparent: false,
    warnings: [],
    media: "video",
    seconds: result ? Math.round(result.seconds * 10) / 10 : undefined,
  };
}

const VIDEO_TYPES: Record<VideoUploadMeta["ext"], string> = { mp4: "video/mp4", mov: "video/quicktime" };

/** Sends the effect's files to ComfyUI and fills its graph. */
async function buildEffectGraph(data: JobData, client: ComfyClient, config: Config): Promise<ApiGraph> {
  const effect = data.effect;
  const meta = effect ? await readUploadMeta(config, effect.video) : null;
  if (!effect || !data.effectText || meta?.kind !== "video") throw new AppError("upload_not_found", 400);
  const video = await readUploadVideo(config, meta);
  if (!video) throw new AppError("upload_not_found", 400);
  const videoName = await client.uploadImage(video, `bigos-${meta.id}.${meta.ext}`, VIDEO_TYPES[meta.ext]);

  let photo: string | null = null;
  if (EFFECTS[effect.id].photo) {
    const png = data.images[0] ? await readUploadImage(config, data.images[0]) : null;
    if (!png) throw new AppError("upload_not_found", 400);
    photo = await client.uploadImage(png, `bigos-${data.images[0]}.png`);
  }
  let frame: string | null = null;
  if (EFFECTS[effect.id].workflow === "fx_clean_plate") {
    // Its first-frame branch is bypassed, but LoadImage needs a file: the frame or a blank image.
    const png =
      (effect.hasFrame ? await readUploadFrame(config, meta.id) : null) ??
      (await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000000" } }).png().toBuffer());
    frame = await client.uploadImage(png, `bigos-${meta.id}_frame.png`);
  }
  return buildEffect(loadTemplate(EFFECTS[effect.id].workflow), {
    workflow: EFFECTS[effect.id].workflow,
    video: videoName,
    photo,
    frame,
    videoSize: { width: effect.width, height: effect.height },
    seconds: effect.seconds,
    text: data.effectText,
    seed: data.seed,
  });
}

async function buildGraph(
  data: JobData,
  client: ComfyClient,
  config: Config,
  warnings: Detail[],
): Promise<ApiGraph> {
  if (isEffect(data)) return buildEffectGraph(data, client, config);
  if (data.workflow === "music") {
    if (!data.music) throw new AppError("invalid_request", 400);
    return buildMusic(loadTemplate("music"), {
      caption: data.finalPrompt ?? data.fallbackPrompt,
      lyrics: data.music.lyrics,
      seconds: data.music.seconds,
      seed: data.seed,
    });
  }
  if (isVideo(data)) {
    if (!data.size || !data.video) throw new AppError("invalid_request", 400);
    const names: string[] = [];
    for (const id of data.images) {
      const png = await readUploadImage(config, id);
      if (!png) throw new AppError("upload_not_found", 400);
      names.push(await client.uploadImage(png, `bigos-${id}.png`));
    }
    return buildVideo(loadTemplate(data.workflow), {
      prompt: data.finalPrompt ?? data.fallbackPrompt,
      ...data.size,
      frames: data.video.frames,
      seed: data.seed,
      images: names,
    });
  }
  const prompt = buildPrompt(data.finalPrompt ?? data.fallbackPrompt, data.transparentBackground);
  if (data.workflow === "t2i") {
    if (!data.size) throw new AppError("invalid_request", 400);
    return buildT2I(loadTemplate("t2i"), { prompt, ...data.size, seed: data.seed, steps: data.steps });
  }
  const stored: SentImage[] = [];
  for (const id of data.images) {
    const png = await readUploadImage(config, id);
    const meta = await readUploadMeta(config, id);
    if (!png || !meta || meta.kind === "video") throw new AppError("upload_not_found", 400);
    stored.push({ png, width: meta.sentWidth, height: meta.sentHeight });
  }
  const { images, reduced } = await fitToBudget(stored, config.maxRefsTotalPixels);
  if (reduced) {
    warnings.push({ code: "references_reduced" });
  }
  const names: string[] = [];
  for (const [i, image] of images.entries()) {
    names.push(await client.uploadImage(image.png, `bigos-${data.images[i]}.png`));
  }
  return buildEdit(loadTemplate("edit"), {
    prompt,
    images: names,
    size: data.size,
    seed: data.seed,
    steps: data.steps,
  });
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
    if (job.data.restore) return await processRestore(job, client, config, controller.signal);
    // The machine may be asleep (Wake-on-LAN): give it time before the first real call.
    if (!(await client.waitUntilAwake(config.comfyWakeMs))) {
      throw new ComfyError("unavailable", `ComfyUI did not wake up within ${config.comfyWakeMs / 1000}s`);
    }
    const warnings: Detail[] = [];
    if (isEffect(job.data) && job.data.effectText === undefined) {
      const effectText = await resolveEffectText(job.data, config.llm, await effectImages(job.data, config));
      console.log(`[worker] job ${id} effect texts: ${JSON.stringify(effectText)}`);
      await job.updateData({ ...job.data, effectText });
    } else if (!isEffect(job.data) && job.data.finalPrompt === undefined) {
      const finalPrompt =
        job.data.workflow === "music"
          ? await resolveMusicPrompt(job.data, config.llm)
          : isVideo(job.data)
            ? await resolveVideoPrompt(job.data, config.llm)
            : await resolvePrompt(job.data, config.llm);
      console.log(`[worker] job ${id} prompt: ${finalPrompt}`);
      await job.updateData({ ...job.data, finalPrompt });
    }
    const graph = await buildGraph(job.data, client, config, warnings);
    let bestShare = 0;
    const { entry } = await runPrompt(client, graph, {
      timeoutMs: isEffect(job.data)
        ? config.effects.timeoutMs
        : job.data.workflow === "music"
          ? config.music.timeoutMs
          : isVideo(job.data)
            ? config.video.timeoutMs
            : config.jobTimeoutMs,
      // A network blip while polling must not fail a job that keeps running on the GPU.
      outageMs: config.comfyWakeMs,
      knownPromptId: job.data.promptId,
      onPromptId: (promptId) => job.updateData({ ...job.data, promptId }),
      onProgress: (progress) => {
        // Nodes after the sampler (video decode) report their own 0→100%: never move the bar back.
        if (progress.phase === "running") {
          const share = progress.max > 0 ? progress.value / progress.max : 0;
          if (share < bestShare) return;
          bestShare = share;
        }
        void job.updateProgress(progress).catch(() => {});
      },
      signal: controller.signal,
    });
    if (job.data.workflow === "music") {
      const mp3 = await client.view(outputAudio(entry, findNodeId(graph, "@save")));
      await writeStored(config, "results", resultName(id, "audio"), mp3);
      const seconds = Math.round(mp3Duration(mp3) * 10) / 10;
      return { width: 0, height: 0, transparent: false, warnings, media: "audio", seconds };
    }
    if (isEffect(job.data)) {
      const output = outputVideo(entry, findNodeId(graph, "@save"));
      await writeStored(config, "results", resultName(id, "video"), await client.view(output));
      const width = output.metadata?.width ?? job.data.effect?.width ?? 0;
      const height = output.metadata?.height ?? job.data.effect?.height ?? 0;
      const seconds = output.metadata?.duration ? Math.round(output.metadata.duration * 10) / 10 : undefined;
      return { width, height, transparent: false, warnings, media: "video", seconds };
    }
    if (isVideo(job.data)) {
      const mp4 = await client.view(outputVideo(entry, findNodeId(graph, "@save")));
      await writeStored(config, "results", resultName(id, "video"), mp4);
      const size = job.data.size ?? { width: 0, height: 0 };
      return { ...size, transparent: false, warnings, media: "video" };
    }
    const raw = await client.view(outputImage(entry, findNodeId(graph, "@save")));
    const image = await finalizeImage(raw, job.data.transparentBackground);
    if (job.data.transparentBackground && (await transparentShare(image.png)) < MIN_TRANSPARENT_SHARE) {
      // Happens with full photos on the edit workflow (spec §14): the model keeps the background.
      warnings.push({ code: "transparency_failed" });
    }
    await writeStored(config, "results", resultName(id), image.png);
    return {
      width: image.width,
      height: image.height,
      transparent: job.data.transparentBackground,
      warnings,
      media: "image",
    };
  } catch (err) {
    const code = toErrorCode(err, controller.signal.aborted || (await isCancelled().catch(() => false)));
    if (code !== "cancelled") console.error(`[worker] job ${id} failed (${code})`, err);
    if (job.data.restore) await removeWork(config, id).catch(() => {});
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
