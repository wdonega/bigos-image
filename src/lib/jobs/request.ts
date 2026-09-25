import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError, describeSizeProblems } from "../errors.ts";
import { PRESET_RATIOS, type Size, checkSize, presetSize } from "../size.ts";
import { randomSeed } from "../workflow/build.ts";

// Request contract of POST /api/jobs (spec §10).
const sizeSchema = z.union([
  z.object({
    ratio: z.enum(PRESET_RATIOS),
    megapixels: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  }),
  z.object({ ratio: z.literal("manual"), width: z.number(), height: z.number() }),
  z.object({ ratio: z.literal("original") }),
]);

export const jobRequestSchema = z.object({
  screen: z.enum(["generate", "edit"]),
  prompt: z
    .string()
    .max(4000)
    .refine((s) => s.trim().length > 0),
  images: z.array(z.string().min(1)).default([]),
  size: sizeSchema,
  quality: z.enum(["normal", "high"]).default("normal"),
  transparent_background: z.boolean().default(false),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
});

export type JobRequest = z.infer<typeof jobRequestSchema>;

/** What the worker needs to build and run the graph; stored as the queue job's data. */
export type JobPlan = {
  workflow: "t2i" | "edit";
  prompt: string;
  transparentBackground: boolean;
  /** null = follow image_1 ("Original", edit only). */
  size: Size | null;
  /** Upload ids, in order: image_1 first. */
  images: string[];
  steps: number;
  seed: number;
};

export function planJob(req: JobRequest, config: Config): JobPlan {
  if (req.screen === "edit" || req.images.length > 0) {
    throw new AppError("not_supported_yet", 501);
  }
  if (req.size.ratio === "original") {
    throw new AppError("invalid_request", 400, ["A opção Original só existe na tela Editar."]);
  }

  const size =
    req.size.ratio === "manual"
      ? { width: req.size.width, height: req.size.height }
      : presetSize(req.size.ratio, req.size.megapixels, config.maxPixels);
  const problems = checkSize(size, config);
  if (problems.length > 0) {
    throw new AppError("invalid_size", 400, describeSizeProblems(problems, config));
  }

  return {
    workflow: "t2i",
    prompt: req.prompt,
    transparentBackground: req.transparent_background,
    size,
    images: [],
    steps: config.steps[req.quality],
    seed: req.seed ?? randomSeed(),
  };
}
