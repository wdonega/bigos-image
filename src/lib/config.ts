import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();

// Every limit comes from the environment (see .env.example); none is hardcoded in the code that
// uses it. Only COMFY_URL and REDIS_URL are required; the rest default to the values in
// .env.example, so a deployment only sets what differs (docker-compose.yml).
const envSchema = z.object({
  COMFY_URL: z.url(),
  REDIS_URL: z.string().min(1),
  STORAGE_DIR: z.string().min(1).default("storage"),
  MAX_REFS: positiveInt.default(10),
  // 2048 × 2048
  MAX_PIXELS: positiveInt.default(4_194_304),
  MIN_SIDE: positiveInt.default(512),
  MAX_ASPECT_RATIO: z.coerce.number().min(1).default(4),
  MAX_INPUT_PIXELS: positiveInt.default(4_194_304),
  // 10 × 1 MP
  MAX_REFS_TOTAL_PIXELS: positiveInt.default(10_485_760),
  MAX_UPLOAD_MB: positiveInt.default(20),
  RETENTION_HOURS: positiveInt.default(24),
  JOB_TIMEOUT_MINUTES: positiveInt.default(15),
  STEPS_NORMAL: positiveInt.default(25),
  STEPS_HIGH: positiveInt.default(40),
  // Video (MiniMax H3): pixels per Quality (≈720p / ≈1080p at 16:9), references, time limit.
  VIDEO_PIXELS_NORMAL: positiveInt.default(921_600),
  VIDEO_PIXELS_HIGH: positiveInt.default(2_073_600),
  // ComfyUI's MiniMaxH3ReferenceToVideo takes at most 9 reference images.
  MAX_VIDEO_REFS: positiveInt.max(9).default(9),
  VIDEO_JOB_TIMEOUT_MINUTES: positiveInt.default(40),
  // The ComfyUI machine wakes on LAN: how long to wait for it before calling it unavailable.
  COMFY_WAKE_SECONDS: positiveInt.default(30),
  // Optional: "Improve text" is hidden when the LLM is not configured.
  LLM_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().min(1).default("prompt-enhancer"),
  // Keep within the model's limits in LiteLLM (max_output_tokens / max_input_tokens).
  LLM_MAX_OUTPUT_TOKENS: positiveInt.default(800),
  LLM_MAX_INPUT_CHARS: positiveInt.default(4000),
});

/** OpenAI-compatible endpoint (LiteLLM) used by "Improve text". */
export type LlmConfig = {
  url: string;
  apiKey: string;
  model: string;
  /** max_tokens sent with each request. */
  maxOutputTokens: number;
  /** Longest user text sent to the LLM; longer texts skip it (the final pass falls back). */
  maxInputChars: number;
};

export type Config = {
  comfyUrl: string;
  /** How long to wait for the ComfyUI machine to wake up (Wake-on-LAN). */
  comfyWakeMs: number;
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
  video: { pixels: { normal: number; high: number }; maxRefs: number; timeoutMs: number };
  llm: LlmConfig | null;
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
    comfyWakeMs: e.COMFY_WAKE_SECONDS * 1000,
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
    video: {
      pixels: { normal: e.VIDEO_PIXELS_NORMAL, high: e.VIDEO_PIXELS_HIGH },
      maxRefs: e.MAX_VIDEO_REFS,
      timeoutMs: e.VIDEO_JOB_TIMEOUT_MINUTES * 60_000,
    },
    llm: e.LLM_URL
      ? {
          url: e.LLM_URL.replace(/\/+$/, ""),
          apiKey: e.LLM_API_KEY ?? "",
          model: e.LLM_MODEL,
          maxOutputTokens: e.LLM_MAX_OUTPUT_TOKENS,
          maxInputChars: e.LLM_MAX_INPUT_CHARS,
        }
      : null,
  };
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
