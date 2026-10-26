import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError, sizeProblemDetails } from "../errors.ts";
import { PRESET_RATIOS, type Size, checkSize, presetSize } from "../size.ts";
import { mentionsToTokens } from "../mentions.ts";
import { STYLE_IDS, type StyleId, applyStyle, findStyle } from "../styles.ts";
import { MUSIC_DURATIONS, MUSIC_GENRE_IDS, type MusicGenreId, fallbackMusicCaption, genrePhrase, normalizeLyrics } from "../music.ts";
import { VIDEO_DURATIONS, VIDEO_RATIOS, buildVideoPrompt, tokensToSubjects, videoFrames, videoSize } from "../video.ts";
import { EFFECTS, EFFECT_IDS, type EffectId, type EffectText, type EffectWorkflow, effectMaxSeconds } from "../effects.ts";
import { COLOR_IDS, RESTORE_MODES, type ColorId, type RestoreMode } from "../restore.ts";
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

// Music (spec §14, decision 30): description + lyrics (or instrumental) + optional genre + duration.
const musicRequestSchema = z.object({
  screen: z.literal("music"),
  prompt: promptSchema,
  lyrics: z.string().max(4000).default(""),
  instrumental: z.boolean().default(false),
  genre: z.enum(MUSIC_GENRE_IDS as [MusicGenreId, ...MusicGenreId[]]).nullable().default(null),
  duration: z.literal(MUSIC_DURATIONS),
});

// Video effects (spec §14, decision 31): an uploaded video (PUT /api/restore/uploads) and the section
// chosen in the trim editor, a photo when the effect needs one, one optional short text and, for
// effects that put someone's identity in the video, consent.
const effectsRequestSchema = z.object({
  screen: z.literal("effects"),
  effect: z.enum(EFFECT_IDS),
  video: z.string().min(1),
  start: z.number().min(0).default(0),
  end: z.number().positive(),
  images: z.array(z.string().min(1)).max(1).default([]),
  prompt: z.string().max(4000).default(""),
  consent: z.boolean().default(false),
});

// Old video restoration (spec §14, decision 32): an uploaded tape, the section chosen in the trim
// editor, the color correction and the mode (cleanup only, or cleanup + SeedVR2 upscale).
const restoreRequestSchema = z.object({
  screen: z.literal("restore"),
  upload: z.string().min(1),
  start: z.number().min(0),
  end: z.number().positive(),
  color: z.enum(COLOR_IDS).default("normalize"),
  mode: z.enum(RESTORE_MODES).default("upscale"),
});

export const jobRequestSchema = z.union([
  imageRequestSchema,
  videoRequestSchema,
  musicRequestSchema,
  effectsRequestSchema,
  restoreRequestSchema,
]);

export type JobRequest = z.infer<typeof jobRequestSchema>;
type ImageRequest = z.infer<typeof imageRequestSchema>;
type VideoRequest = z.infer<typeof videoRequestSchema>;
type MusicRequest = z.infer<typeof musicRequestSchema>;
type EffectsRequest = z.infer<typeof effectsRequestSchema>;
type RestoreRequest = z.infer<typeof restoreRequestSchema>;

/** What the worker needs to build and run the graph; stored as the queue job's data. */
export type JobPlan = {
  /** The graph: images by number of images (spec §3); video with references uses Ref2VA. */
  workflow: "t2i" | "edit" | "video_fl2va" | "video_ref2va" | "music" | EffectWorkflow | "restore";
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
  /** Music only: the lyrics as sung (never translated), instrumental flag and max seconds. */
  music?: { lyrics: string; instrumental: boolean; seconds: number };
  /** Effects only: the uploaded video and the section to change. `images` holds the face/character photo, if any. */
  effect?: { id: EffectId; video: string; start: number; seconds: number };
  /** Effects only: the vision pass's English texts once the worker computed them (kept for retries). */
  effectText?: EffectText;
  /** Restoration only: the tape, the section and the choices; `state` tracks the chunks already upscaled. */
  restore?: {
    upload: string;
    start: number;
    seconds: number;
    color: ColorId;
    mode: RestoreMode;
    state: { chunksDone: number; chunk?: number; promptId?: string };
  };
};

/** Looks up a stored upload; injected so planning stays testable without disk. */
export type UploadLookup = (id: string) => Promise<UploadFacts | null>;

/** What planning needs to know about an upload; images stored before videos existed have no kind. */
export type UploadFacts = {
  id: string;
  kind?: "image" | "tape";
  /** Videos (restoration and effects): the probed facts. */
  info?: { seconds: number };
};

/**
 * Validates a request and turns it into a plan. The workflow follows the number of images
 * (spec §3): none → t2i; one or more → edit. The size is always recomputed here (spec §5).
 */
export async function planJob(
  req: JobRequest,
  config: Config,
  findUpload: UploadLookup,
): Promise<JobPlan> {
  if (req.screen === "music") return planMusic(req);
  if (req.screen === "effects") return planEffect(req, config, findUpload);
  if (req.screen === "restore") return planRestore(req, config, findUpload);
  return req.screen === "video" ? planVideo(req, config, findUpload) : planImage(req, config, findUpload);
}

/** Every id must be a stored image (a video id where an image belongs counts as not found). */
async function checkUploads(ids: string[], findUpload: UploadLookup) {
  for (const id of ids) {
    const upload = await findUpload(id);
    if (!upload || upload.kind === "tape") throw new AppError("upload_not_found", 400);
  }
}

/** A section [start, end] of an uploaded video, checked against its length and `max` seconds. */
async function planSection(id: string, start: number, endAsked: number, max: number, findUpload: UploadLookup) {
  const video = await findUpload(id);
  if (!video || video.kind !== "tape" || !video.info) throw new AppError("upload_not_found", 400);
  const end = Math.min(endAsked, video.info.seconds);
  const seconds = Math.round((end - start) * 1000) / 1000;
  if (endAsked > video.info.seconds + END_SLACK_SECONDS || seconds < MIN_SECTION_SECONDS) {
    throw new AppError("invalid_request", 400, [{ code: "section_invalid", params: { min: MIN_SECTION_SECONDS } }]);
  }
  if (seconds > max + 0.01) throw new AppError("invalid_request", 400, [{ code: "section_too_long", params: { max } }]);
  return { id: video.id, start, seconds };
}

/** Shortest section worth a job (restoration and effects). */
const MIN_SECTION_SECONDS = 1;
/** Slack for an end handle on the last frame (durations are rounded differently by the browser). */
const END_SLACK_SECONDS = 0.25;

async function planRestore(req: RestoreRequest, config: Config, findUpload: UploadLookup): Promise<JobPlan> {
  const section = await planSection(req.upload, req.start, req.end, config.restore.maxSeconds[req.mode], findUpload);
  return {
    workflow: "restore",
    text: "",
    style: null,
    fallbackPrompt: "",
    transparentBackground: false,
    size: null,
    images: [],
    steps: 0,
    seed: randomSeed(),
    restore: { upload: section.id, start: section.start, seconds: section.seconds, color: req.color, mode: req.mode, state: { chunksDone: 0 } },
  };
}

async function planEffect(req: EffectsRequest, config: Config, findUpload: UploadLookup): Promise<JobPlan> {
  const spec = EFFECTS[req.effect];
  const section = await planSection(req.video, req.start, req.end, effectMaxSeconds(req.effect, config.effects.maxSeconds), findUpload);
  if (spec.photo && req.images.length !== 1) {
    throw new AppError("invalid_request", 400, [{ code: "effect_needs_photo", params: { photo: spec.photo } }]);
  }
  if (spec.consent && !req.consent) throw new AppError("invalid_request", 400, [{ code: "consent_required" }]);
  const images = spec.photo ? req.images : [];
  await checkUploads(images, findUpload);
  return {
    workflow: spec.workflow,
    text: req.prompt.trim(),
    style: null,
    fallbackPrompt: "",
    transparentBackground: false,
    size: null,
    images,
    steps: 0,
    seed: randomSeed(),
    effect: { id: req.effect, video: section.id, start: section.start, seconds: section.seconds },
  };
}

function planMusic(req: MusicRequest): JobPlan {
  return {
    workflow: "music",
    text: req.prompt,
    // The genre's English phrase; the final pass puts it first in the caption.
    style: genrePhrase(req.genre),
    fallbackPrompt: fallbackMusicCaption(req.prompt, req.genre, req.instrumental),
    transparentBackground: false,
    size: null,
    images: [],
    steps: 0,
    seed: randomSeed(),
    music: {
      lyrics: normalizeLyrics(req.lyrics, req.instrumental),
      instrumental: req.instrumental,
      seconds: req.duration,
    },
  };
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
