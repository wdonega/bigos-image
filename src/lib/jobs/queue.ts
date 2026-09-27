import { Job, Queue } from "bullmq";
import { Redis } from "ioredis";
import type { RunProgress } from "../comfy/run.ts";
import { getConfig } from "../config.ts";
import { AppError, type Detail, type ErrorCode, errorMessage, isErrorCode } from "../errors.ts";
import type { JobPlan } from "./request.ts";

// Generation queue in Redis (spec §12): one job at a time, state survives restarts.
export const QUEUE_NAME = "bigos-generations";

export type JobData = JobPlan & { promptId?: string };
export type JobResult = {
  width: number;
  height: number;
  transparent: boolean;
  warnings: Detail[];
  /** Missing on jobs finished before videos existed: an image. */
  media?: Media;
  /** Real length of a song, in seconds (the model may end before the asked duration). */
  seconds?: number;
};

export type Media = "image" | "video" | "audio";

export type JobView =
  | { id: string; status: "queued"; ahead: number }
  | { id: string; status: "waiting"; ahead: number | null }
  | { id: string; status: "running"; progress: number | null }
  | {
      id: string;
      status: "done";
      media: Media;
      /** The PNG (images), MP4 (videos) or MP3 (music). */
      url: string;
      seconds?: number;
      width: number;
      height: number;
      transparent: boolean;
      warnings: Detail[];
    }
  | { id: string; status: "failed"; error: { code: ErrorCode; message: string } }
  | { id: string; status: "cancelled" };

export const TERMINAL_STATUSES = new Set<JobView["status"]>(["done", "failed", "cancelled"]);

type Shared = { redis?: Redis; queue?: Queue<JobData, JobResult> };
const holder = globalThis as typeof globalThis & { __bigosQueue?: Shared };
const shared: Shared = (holder.__bigosQueue ??= {});

/** Worker connections must block forever; API connections must fail fast when Redis is down. */
export function createRedis(forWorker: boolean): Redis {
  return new Redis(
    getConfig().redisUrl,
    forWorker ? { maxRetriesPerRequest: null } : { maxRetriesPerRequest: 1, connectTimeout: 3_000 },
  );
}

function redis(): Redis {
  shared.redis ??= createRedis(false);
  return shared.redis;
}

function queue(): Queue<JobData, JobResult> {
  shared.queue ??= new Queue<JobData, JobResult>(QUEUE_NAME, { connection: redis() });
  return shared.queue;
}

export const cancelKey = (jobId: string) => `bigos:cancel:${jobId}`;

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[queue] redis error", err);
    throw new AppError("queue_unavailable", 503);
  }
}

export function enqueue(plan: JobPlan): Promise<string> {
  return guard(async () => {
    const age = Math.ceil(getConfig().retentionMs / 1000);
    const job = await queue().add("generate", plan, {
      removeOnComplete: { age },
      removeOnFail: { age },
    });
    return job.id as string;
  });
}

export function getJob(id: string): Promise<Job<JobData, JobResult> | undefined> {
  return guard(() => Job.fromId<JobData, JobResult>(queue(), id));
}

function isCancelled(id: string): Promise<boolean> {
  return redis()
    .exists(cancelKey(id))
    .then((n) => n > 0);
}

async function jobsAhead(id: string): Promise<number> {
  const [active, waiting] = await Promise.all([
    queue().getActiveCount(),
    queue().getJobs(["waiting", "prioritized"], 0, -1, true),
  ]);
  const index = waiting.findIndex((job) => job.id === id);
  return active + Math.max(index, 0);
}

function progressView(id: string, progress: unknown): JobView {
  const p = progress as RunProgress | undefined;
  if (p && typeof p === "object" && p.phase === "waiting") {
    // ComfyUI position N = N-th pending prompt, so N prompts (including the running one) are ahead.
    return { id, status: "waiting", ahead: p.position };
  }
  if (p && typeof p === "object" && p.phase === "running" && p.max > 0) {
    return { id, status: "running", progress: p.value / p.max };
  }
  return { id, status: "running", progress: null };
}

export function getJobView(id: string): Promise<JobView | null> {
  return guard(async () => {
    const job = await Job.fromId<JobData, JobResult>(queue(), id);
    if (!job) return (await isCancelled(id)) ? { id, status: "cancelled" } : null;

    const state = await job.getState();
    if (state === "completed") {
      const r = job.returnvalue;
      return {
        id,
        status: "done",
        media: r.media ?? "image",
        url: `/api/jobs/${id}/${r.media ?? "image"}`,
        seconds: r.seconds,
        width: r.width,
        height: r.height,
        transparent: r.transparent,
        warnings: r.warnings,
      };
    }
    if (await isCancelled(id)) return { id, status: "cancelled" };
    if (state === "failed") {
      const code: ErrorCode = isErrorCode(job.failedReason) ? job.failedReason : "generation_failed";
      if (code === "cancelled") return { id, status: "cancelled" };
      return { id, status: "failed", error: { code, message: errorMessage(code) } };
    }
    if (state === "active") return progressView(id, job.progress);
    return { id, status: "queued", ahead: await jobsAhead(id) };
  });
}

/** Marks the job cancelled; a queued job is removed, a running one is stopped by the worker. */
export function cancelJob(id: string): Promise<JobView | null> {
  return guard(async () => {
    const job = await Job.fromId<JobData, JobResult>(queue(), id);
    if (!job) return null;
    const state = await job.getState();
    if (state === "completed" || state === "failed") return getJobView(id);

    await redis().set(cancelKey(id), "1", "PX", getConfig().retentionMs);
    if (state !== "active") await job.remove().catch(() => {});
    return { id, status: "cancelled" };
  });
}

export async function pingQueue(): Promise<boolean> {
  try {
    return (await redis().ping()) === "PONG";
  } catch {
    return false;
  }
}
