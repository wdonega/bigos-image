import { describe, expect, it } from "vitest";
import { AppError } from "../errors";
import { testConfig } from "../test-config";
import { jobRequestSchema, planJob } from "./request";

const parse = (body: unknown) => jobRequestSchema.parse(body);
const base = { screen: "generate", prompt: "um gato", size: { ratio: "1:1", megapixels: 1 } };

describe("planJob", () => {
  it("defaults to 1:1 · 1 MP, normal quality, random seed, t2i", () => {
    const plan = planJob(parse(base), testConfig);
    expect(plan).toMatchObject({
      workflow: "t2i",
      prompt: "um gato",
      size: { width: 1024, height: 1024 },
      steps: 25,
      transparentBackground: false,
    });
    expect(Number.isSafeInteger(plan.seed)).toBe(true);
  });

  it("recomputes preset sizes and maps quality to steps", () => {
    const plan = planJob(
      parse({ ...base, size: { ratio: "16:9", megapixels: 2 }, quality: "high", seed: 5 }),
      testConfig,
    );
    expect(plan).toMatchObject({ size: { width: 1920, height: 1088 }, steps: 40, seed: 5 });
  });

  it("accepts a valid Manual size", () => {
    const plan = planJob(parse({ ...base, size: { ratio: "manual", width: 1280, height: 736 } }), testConfig);
    expect(plan.size).toEqual({ width: 1280, height: 736 });
  });

  it("rejects an invalid Manual size with readable reasons", () => {
    const req = parse({ ...base, size: { ratio: "manual", width: 1000, height: 300 } });
    const err = (() => {
      try {
        planJob(req, testConfig);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "invalid_size", status: 400 });
    expect((err as AppError).details).toContain("Largura e altura precisam ser múltiplos de 32.");
  });

  it("rejects Original on the Gerar screen", () => {
    expect(() => planJob(parse({ ...base, size: { ratio: "original" } }), testConfig)).toThrow(
      AppError,
    );
  });

  it("rejects blank prompts and unknown ratios at the schema", () => {
    expect(jobRequestSchema.safeParse({ ...base, prompt: "   " }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...base, size: { ratio: "5:4", megapixels: 1 } }).success).toBe(
      false,
    );
    expect(jobRequestSchema.safeParse({ ...base, size: { ratio: "1:1", megapixels: 3 } }).success).toBe(
      false,
    );
  });
});
