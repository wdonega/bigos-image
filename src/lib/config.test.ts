import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const env = {
  COMFY_URL: "https://comfy.example/",
  REDIS_URL: "redis://127.0.0.1:6379",
  STORAGE_DIR: "storage",
  MAX_REFS: "10",
  MAX_PIXELS: "4194304",
  MIN_SIDE: "512",
  MAX_ASPECT_RATIO: "4",
  MAX_INPUT_PIXELS: "4194304",
  MAX_REFS_TOTAL_PIXELS: "10485760",
  MAX_UPLOAD_MB: "20",
  RETENTION_HOURS: "24",
  JOB_TIMEOUT_MINUTES: "15",
  STEPS_NORMAL: "25",
  STEPS_HIGH: "40",
};

describe("parseConfig", () => {
  it("reads every limit from the environment", () => {
    const config = parseConfig(env);
    expect(config.comfyUrl).toBe("https://comfy.example");
    expect(config.maxPixels).toBe(4_194_304);
    expect(config.maxUploadBytes).toBe(20 * 1024 * 1024);
    expect(config.steps).toEqual({ normal: 25, high: 40 });
  });

  it("fails loudly when a required setting is missing", () => {
    expect(() => parseConfig({ ...env, COMFY_URL: undefined })).toThrow(/COMFY_URL/);
    expect(() => parseConfig({ ...env, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
  });

  it("falls back to the documented defaults for everything else", () => {
    const config = parseConfig({ COMFY_URL: env.COMFY_URL, REDIS_URL: env.REDIS_URL });
    expect(config).toEqual(parseConfig(env));
    expect(config.llm).toBeNull();
  });

  it("requires the references budget to fit at least one full input image", () => {
    expect(() => parseConfig({ ...env, MAX_REFS_TOTAL_PIXELS: "1000000" })).toThrow(/MAX_REFS_TOTAL_PIXELS/);
  });

  it("rejects non-numeric limits", () => {
    expect(() => parseConfig({ ...env, MIN_SIDE: "big" })).toThrow(/MIN_SIDE/);
  });
});
