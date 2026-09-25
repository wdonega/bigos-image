import { randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import type { Config } from "./config.ts";
import { AppError, type Detail } from "./errors.ts";
import { SIZE_MULTIPLE, floor32 } from "./size.ts";
import { readStored, writeStored } from "./storage.ts";

// Uploaded images (spec §7.2): normalized before they ever reach ComfyUI.
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);
const UUID = /^[0-9a-f-]{36}$/;

export type UploadMeta = {
  id: string;
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

export async function readUploadMeta(config: Config, id: string): Promise<UploadMeta | null> {
  if (!UUID.test(id)) return null;
  const raw = await readStored(config, "uploads", `${id}.json`);
  return raw ? (JSON.parse(raw.toString("utf8")) as UploadMeta) : null;
}

export async function readUploadImage(config: Config, id: string): Promise<Buffer | null> {
  if (!UUID.test(id)) return null;
  return readStored(config, "uploads", `${id}.png`);
}
