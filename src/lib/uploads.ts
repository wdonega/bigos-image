import { randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import type { Config } from "./config.ts";
import { AppError, type Detail } from "./errors.ts";
import { readVideoInfo } from "./mp4.ts";
import { SIZE_MULTIPLE, floor32 } from "./size.ts";
import { readStored, writeStored } from "./storage.ts";

// Uploaded images (spec §7.2): normalized before they ever reach ComfyUI.
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);
const UUID = /^[0-9a-f-]{36}$/;

export type UploadMeta = {
  id: string;
  /** Missing on images stored before videos existed. */
  kind?: "image";
  /** As received (after EXIF rotation). */
  width: number;
  height: number;
  /** As sent to ComfyUI: within the pixel limit, short side ≥ MIN_SIDE, sides multiple of 32. */
  sentWidth: number;
  sentHeight: number;
  warnings: Detail[];
};

type Limits = Pick<Config, "maxInputPixels" | "minSide">;

/**
 * Reduces images above MAX_INPUT_PIXELS, enlarges images whose short side is below MIN_SIDE,
 * then center-crops to multiples of 32 (≤ 31 px per side) so "Original" is exact and predictable.
 */
export async function prepareImage(data: Buffer, limits: Limits) {
  let oriented: { data: Buffer; info: OutputInfo };
  try {
    const meta = await sharp(data).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new Error(`format ${meta.format}`);
    oriented = await sharp(data).rotate().png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("invalid_image", 400);
  }
  const { width, height } = oriented.info;
  const warnings: Detail[] = [];

  let scale = 1;
  if (width * height > limits.maxInputPixels) {
    scale = Math.sqrt(limits.maxInputPixels / (width * height));
  } else if (Math.min(width, height) < limits.minSide) {
    scale = limits.minSide / Math.min(width, height);
  }
  const sentWidth = Math.max(SIZE_MULTIPLE, floor32(Math.round(width * scale)));
  const sentHeight = Math.max(SIZE_MULTIPLE, floor32(Math.round(height * scale)));

  if (scale < 1) {
    warnings.push({ code: "image_reduced", params: { width: sentWidth, height: sentHeight } });
  } else if (scale > 1) {
    warnings.push({ code: "image_enlarged", params: { width: sentWidth, height: sentHeight } });
  }

  const png =
    sentWidth === width && sentHeight === height
      ? oriented.data
      : await sharp(oriented.data)
          .resize(sentWidth, sentHeight, { fit: "cover", position: "centre" })
          .png()
          .toBuffer();

  return { png, width, height, sentWidth, sentHeight, warnings };
}

export type SentImage = { png: Buffer; width: number; height: number };

/**
 * Keeps the sum of pixels of a job's images within the VRAM budget (spec §14): above it, every
 * image is scaled by the same factor (floor32). Returns the images and whether any was reduced.
 */
export async function fitToBudget(images: SentImage[], budget: number) {
  const total = images.reduce((sum, i) => sum + i.width * i.height, 0);
  if (total <= budget) return { images, reduced: false };
  const scale = Math.sqrt(budget / total);
  const fitted = await Promise.all(
    images.map(async (i) => {
      const width = Math.max(SIZE_MULTIPLE, floor32(i.width * scale));
      const height = Math.max(SIZE_MULTIPLE, floor32(i.height * scale));
      const png = await sharp(i.png).resize(width, height, { fit: "cover" }).png().toBuffer();
      return { png, width, height };
    }),
  );
  return { images: fitted, reduced: true };
}

export async function saveUpload(config: Config, data: Buffer): Promise<UploadMeta> {
  if (data.length > config.maxUploadBytes) throw new AppError("image_too_large", 413);
  const prepared = await prepareImage(data, config);
  const meta: UploadMeta = {
    id: randomUUID(),
    kind: "image",
    width: prepared.width,
    height: prepared.height,
    sentWidth: prepared.sentWidth,
    sentHeight: prepared.sentHeight,
    warnings: prepared.warnings,
  };
  await writeStored(config, "uploads", `${meta.id}.png`, prepared.png);
  await writeStored(config, "uploads", `${meta.id}.json`, Buffer.from(JSON.stringify(meta)));
  return meta;
}

export async function readUploadMeta(config: Config, id: string): Promise<UploadMeta | VideoUploadMeta | null> {
  if (!UUID.test(id)) return null;
  const raw = await readStored(config, "uploads", `${id}.json`);
  return raw ? (JSON.parse(raw.toString("utf8")) as UploadMeta | VideoUploadMeta) : null;
}

export async function readUploadImage(config: Config, id: string): Promise<Buffer | null> {
  if (!UUID.test(id)) return null;
  return readStored(config, "uploads", `${id}.png`);
}

// Uploaded videos (spec §14, decision 31): stored as received (ComfyUI decodes them); only the
// header is read here, for the duration, size and audio track. The browser sends the first frame
// along (no ffmpeg on the server), used by the worker's vision pass.

export type VideoUploadMeta = {
  id: string;
  kind: "video";
  /** Container as received: QuickTime (`qt  ` brand) or MP4. */
  ext: "mp4" | "mov";
  /** Displayed size (rotation applied) and length of the whole file. */
  width: number;
  height: number;
  seconds: number;
  hasAudio: boolean;
  /** Whether the first frame was stored next to it (`<id>_frame.png`). */
  hasFrame: boolean;
  warnings: Detail[];
};

/** Shortest video an effect accepts: below it the models have too few frames to work with. */
const MIN_VIDEO_SECONDS = 1;

/** Stores a video upload; `frame` is the browser's capture of its first frame (optional). */
export async function saveVideoUpload(config: Config, data: Buffer, frame: Buffer | null): Promise<VideoUploadMeta> {
  if (data.length > config.effects.maxUploadBytes) throw new AppError("video_too_large", 413);
  const info = readVideoInfo(data);
  if (!info || !info.hasVideo || info.width === 0 || info.seconds < MIN_VIDEO_SECONDS) {
    throw new AppError("invalid_video", 400, info && info.seconds < MIN_VIDEO_SECONDS ? [{ code: "video_too_short", params: { min: MIN_VIDEO_SECONDS } }] : []);
  }
  const warnings: Detail[] = [];
  if (info.seconds > config.effects.maxSeconds) {
    warnings.push({ code: "video_trimmed", params: { seconds: config.effects.maxSeconds } });
  }
  const id = randomUUID();
  let hasFrame = false;
  if (frame) {
    // A bad frame only costs the vision pass (the worker falls back), never the upload.
    const prepared = await prepareImage(frame, config).catch(() => null);
    if (prepared) {
      await writeStored(config, "uploads", `${id}_frame.png`, prepared.png);
      hasFrame = true;
    }
  }
  const brand = String.fromCharCode(...data.subarray(8, 12));
  const meta: VideoUploadMeta = {
    id,
    kind: "video",
    ext: brand === "qt  " ? "mov" : "mp4",
    width: info.width,
    height: info.height,
    seconds: Math.round(info.seconds * 1000) / 1000,
    hasAudio: info.hasAudio,
    hasFrame,
    warnings,
  };
  await writeStored(config, "uploads", `${id}.${meta.ext}`, data);
  await writeStored(config, "uploads", `${id}.json`, Buffer.from(JSON.stringify(meta)));
  return meta;
}

export async function readUploadVideo(config: Config, meta: VideoUploadMeta): Promise<Buffer | null> {
  if (!UUID.test(meta.id)) return null;
  return readStored(config, "uploads", `${meta.id}.${meta.ext}`);
}

export async function readUploadFrame(config: Config, id: string): Promise<Buffer | null> {
  if (!UUID.test(id)) return null;
  return readStored(config, "uploads", `${id}_frame.png`);
}
