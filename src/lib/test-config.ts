import type { Config } from "./config.ts";

// Config fixture for unit tests, matching the defaults in .env.example.
export const testConfig: Config = {
  comfyUrl: "http://comfy.test",
  redisUrl: "redis://127.0.0.1:6379",
  storageDir: "storage-test",
  maxRefs: 10,
  maxPixels: 4_194_304,
  minSide: 512,
  maxAspectRatio: 4,
  maxInputPixels: 4_194_304,
  maxRefsTotalPixels: 10_485_760,
  maxUploadBytes: 20 * 1024 * 1024,
  retentionMs: 24 * 3_600_000,
  jobTimeoutMs: 15 * 60_000,
  steps: { normal: 25, high: 40 },
  llm: null,
};
