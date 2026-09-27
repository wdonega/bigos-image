import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError, sizeProblemDetails } from "../errors.ts";
import { PRESET_RATIOS, type Size, checkSize, presetSize } from "../size.ts";
import { mentionsToTokens } from "../mentions.ts";
import { STYLE_IDS, type StyleId, applyStyle, findStyle } from "../styles.ts";
import { VIDEO_DURATIONS, VIDEO_RATIOS, buildVideoPrompt, tokensToSubjects, videoFrames, videoSize } from "../video.ts";
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

const promptSchema = z
  .string()
  .max(4000)
  .refine((s) => s.trim().length > 0);
const styleSchema = z.enum(STYLE_IDS as [StyleId, ...StyleId[]]).nullable().default(null);
const qualitySchema = z.enum(["normal", "high"]).default("normal");

const imageRequestSchema = z.object({
  screen: z.enum(["generate", "edit"]),
  prompt: promptSchema,
  images: z.array(z.string().min(1)).default([]),
  size: sizeSchema,
  quality: qualitySchema,
  transparent_background: z.boolean().default(false),
  style: styleSchema,
});

// Video (spec §14, decision 28): proportion + duration + quality; references are optional.
const videoRequestSchema = z.object({
  screen: z.literal("video"),
  prompt: promptSchema,
  images: z.array(z.string().min(1)).default([]),
  ratio: z.enum(VIDEO_RATIOS),
  duration: z.literal(VIDEO_DURATIONS),
  quality: qualitySchema,
  style: styleSchema,
});

export const jobRequestSchema = z.union([imageRequestSchema, videoRequestSchema]);

export type JobRequest = z.infer<typeof jobRequestSchema>;
type ImageRequest = z.infer<typeof imageRequestSchema>;
type VideoRequest = z.infer<typeof videoRequestSchema>;

/** What the worker needs to build and run the graph; stored as the queue job's data. */
export type JobPlan = {
  /** The graph: images by number of images (spec §3); video with references uses Ref2VA. */
  workflow: "t2i" | "edit" | "video_fl2va" | "video_ref2va";
  /**
   * Source of the worker's final LLM pass (English, <imageN> references, style up front): the
   * user's text with mentions already as <imageN>.
   */
  text: string;
  /** English phrase of the chosen style, or null. */
  style: string | null;
  /** Used when the final pass is unavailable: the text with the style phrase appended. */
  fallbackPrompt: string;
  /** Final prompt once the worker computed it; kept so a retried job sends the same text. */
  finalPrompt?: string;
  transparentBackground: boolean;
  /** null = follow image_1 ("Original", edit only). */
  size: Size | null;
  /** Upload ids, in order: image_1 first. */
  images: string[];
  /** Sampling steps (images only; video steps are fixed by its LoRA in the graph). */
  steps: number;
  seed: number;
  /** Video only: frames at 24 fps (H3's 17k + 5 grid) and the requested seconds. */
  video?: { frames: number; seconds: number };
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
  return req.screen === "video" ? planVideo(req, config, findUpload) : planImage(req, config, findUpload);
}

async function checkUploads(ids: string[], findUpload: UploadLookup) {
  for (const id of ids) {
    if (!(await findUpload(id))) throw new AppError("upload_not_found", 400);
  }
}

async function planVideo(req: VideoRequest, config: Config, findUpload: UploadLookup): Promise<JobPlan> {
  if (req.images.length > config.video.maxRefs) {
    throw new AppError("too_many_images", 400, [{ code: "max_refs", params: { max: config.video.maxRefs } }]);
  }
  await checkUploads(req.images, findUpload);
  const references = req.images.length;
  const text = references > 0 ? mentionsToTokens(req.prompt) : req.prompt;
  return {
    workflow: references > 0 ? "video_ref2va" : "video_fl2va",
    text,
    style: req.style ? (findStyle(req.style)?.prompt ?? null) : null,
    // Without the LLM: the text as written, style appended, sound left to the model.
    fallbackPrompt: buildVideoPrompt({
      description: tokensToSubjects(applyStyle(text, req.style)),
      soundscape: "",
      music: "",
      references,
    }),
    transparentBackground: false,
    size: videoSize(req.ratio, config.video.pixels[req.quality]),
    images: req.images,
    steps: 0,
    seed: randomSeed(),
    video: { frames: videoFrames(req.duration), seconds: req.duration },
  };
}

async function planImage(req: ImageRequest, config: Config, findUpload: UploadLookup): Promise<JobPlan> {
  if (req.screen === "edit" && req.images.length !== 1) {
    throw new AppError("invalid_request", 400, [{ code: "edit_needs_one_image" }]);
  }
  if (req.screen === "generate" && req.images.length > config.maxRefs) {
    throw new AppError("too_many_images", 400, [{ code: "max_refs", params: { max: config.maxRefs } }]);
  }
  // Original follows image_1 (spec §7), so it needs a reference image (spec §14, decision 29).
  if (req.size.ratio === "original" && req.images.length === 0) {
    throw new AppError("invalid_request", 400, [{ code: "original_needs_image" }]);
  }
  await checkUploads(req.images, findUpload);

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
  const text = withImages ? mentionsToTokens(req.prompt) : req.prompt;
  return {
    workflow: withImages ? "edit" : "t2i",
    text,
    style: req.style ? (findStyle(req.style)?.prompt ?? null) : null,
    fallbackPrompt: applyStyle(text, req.style),
    transparentBackground: req.transparent_background,
    size,
    images: req.images,
    steps: config.steps[req.quality],
    // Always random: the seed is not exposed to users (spec §14, decision 18).
    seed: randomSeed(),
  };
}
