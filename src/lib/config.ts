import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();

// Every limit comes from the environment (see .env.example); none is hardcoded.
const envSchema = z.object({
  COMFY_URL: z.url(),
  REDIS_URL: z.string().min(1),
  STORAGE_DIR: z.string().min(1),
  MAX_REFS: positiveInt,
  MAX_PIXELS: positiveInt,
  MIN_SIDE: positiveInt,
  MAX_ASPECT_RATIO: z.coerce.number().min(1),
  MAX_INPUT_PIXELS: positiveInt,
  MAX_REFS_TOTAL_PIXELS: positiveInt,
  MAX_UPLOAD_MB: positiveInt,
  RETENTION_HOURS: positiveInt,
  JOB_TIMEOUT_MINUTES: positiveInt,
  STEPS_NORMAL: positiveInt,
  STEPS_HIGH: positiveInt,
});

export type Config = {
  comfyUrl: string;
  redisUrl: string;
  storageDir: string;
  maxRefs: number;
  maxPixels: number;
  minSide: number;
  maxAspectRatio: number;
  maxInputPixels: number;
  /** Sum of pixels of all images sent to the encoder in one job (VRAM, spec §14). */
  maxRefsTotalPixels: number;
  maxUploadBytes: number;
  retentionMs: number;
  jobTimeoutMs: number;
  steps: { normal: number; high: number };
};

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration (check .env):\n${z.prettifyError(result.error)}`);
  }
  const e = result.data;
  if (e.MAX_REFS_TOTAL_PIXELS < e.MAX_INPUT_PIXELS) {
    throw new Error("Invalid configuration (check .env): MAX_REFS_TOTAL_PIXELS must be >= MAX_INPUT_PIXELS");
  }
  return {
    comfyUrl: e.COMFY_URL.replace(/\/+$/, ""),
    redisUrl: e.REDIS_URL,
    storageDir: e.STORAGE_DIR,
    maxRefs: e.MAX_REFS,
    maxPixels: e.MAX_PIXELS,
    minSide: e.MIN_SIDE,
    maxAspectRatio: e.MAX_ASPECT_RATIO,
    maxInputPixels: e.MAX_INPUT_PIXELS,
    maxRefsTotalPixels: e.MAX_REFS_TOTAL_PIXELS,
    maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
    retentionMs: e.RETENTION_HOURS * 3_600_000,
    jobTimeoutMs: e.JOB_TIMEOUT_MINUTES * 60_000,
    steps: { normal: e.STEPS_NORMAL, high: e.STEPS_HIGH },
  };
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
