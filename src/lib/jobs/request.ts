import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError, sizeProblemDetails } from "../errors.ts";
import { PRESET_RATIOS, type Size, checkSize, presetSize } from "../size.ts";
import { mentionsToTokens } from "../mentions.ts";
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

/** Looks up a stored upload; injected so planning stays testable without disk. */
export type UploadLookup = (id: string) => Promise<{ id: string } | null>;

/**
 * Validates a request and turns it into a plan. The workflow follows the number of images
 * (spec §3): none → t2i; one or more → edit. The size is always recomputed here (spec §5).
 */
export async function planJob(
  req: JobRequest,
  config: Config,
  findUpload: UploadLookup,
): Promise<JobPlan> {
  if (req.screen === "edit" && req.images.length !== 1) {
    throw new AppError("invalid_request", 400, [{ code: "edit_needs_one_image" }]);
  }
  if (req.screen === "generate" && req.images.length > config.maxRefs) {
    throw new AppError("too_many_images", 400, [{ code: "max_refs", params: { max: config.maxRefs } }]);
  }
  if (req.size.ratio === "original" && req.screen !== "edit") {
    throw new AppError("invalid_request", 400, [{ code: "original_edit_only" }]);
  }
  for (const id of req.images) {
    if (!(await findUpload(id))) throw new AppError("upload_not_found", 400);
  }

  let size: Size | null = null;
  if (req.size.ratio !== "original") {
    size =
      req.size.ratio === "manual"
        ? { width: req.size.width, height: req.size.height }
        : presetSize(req.size.ratio, req.size.megapixels, config.maxPixels);
    const problems = checkSize(size, config);
    if (problems.length > 0) {
      throw new AppError("invalid_size", 400, sizeProblemDetails(problems, config));
    }
  }

  const withImages = req.images.length > 0;
  return {
    workflow: withImages ? "edit" : "t2i",
    prompt: withImages ? mentionsToTokens(req.prompt) : req.prompt,
    transparentBackground: req.transparent_background,
    size,
    images: req.images,
    steps: config.steps[req.quality],
    // Always random: the seed is not exposed to users (spec §14, decision 18).
    seed: randomSeed(),
  };
}
