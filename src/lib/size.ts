// Output size rules (spec §5 and §6). Pure: limits are passed in from config.

export const PRESET_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"] as const;
export type PresetRatio = (typeof PRESET_RATIOS)[number];

export const MEGAPIXEL_OPTIONS = [1, 2, 4] as const;
export type Megapixels = (typeof MEGAPIXEL_OPTIONS)[number];

// Model constraints, not tunable limits: sides are multiples of 32 and 1 MP = 1024².
export const SIZE_MULTIPLE = 32;
const ONE_MEGAPIXEL = 1024 * 1024;

export type Size = { width: number; height: number };
export type SizeLimits = { maxPixels: number; minSide: number; maxAspectRatio: number };
export type SizeProblem =
  | "not_integer"
  | "not_multiple"
  | "below_min_side"
  | "above_max_pixels"
  | "aspect_ratio";

export const round32 = (v: number) => Math.round(v / SIZE_MULTIPLE) * SIZE_MULTIPLE;
export const floor32 = (v: number) => Math.floor(v / SIZE_MULTIPLE) * SIZE_MULTIPLE;

export function presetSize(ratio: PresetRatio, megapixels: Megapixels, maxPixels: number): Size {
  const [a, b] = ratio.split(":").map(Number);
  const pixels = megapixels * ONE_MEGAPIXEL;
  const w = Math.sqrt((pixels * a) / b);
  const h = pixels / w;
  const rounded = { width: round32(w), height: round32(h) };
  if (rounded.width * rounded.height <= maxPixels) return rounded;
  return { width: floor32(w), height: floor32(h) };
}

/** Returns every rule the size breaks; an empty list means the size is valid. */
export function checkSize({ width, height }: Size, limits: SizeLimits): SizeProblem[] {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return ["not_integer"];
  const problems: SizeProblem[] = [];
  if (width % SIZE_MULTIPLE !== 0 || height % SIZE_MULTIPLE !== 0) problems.push("not_multiple");
  if (Math.min(width, height) < limits.minSide) problems.push("below_min_side");
  if (width * height > limits.maxPixels) problems.push("above_max_pixels");
  if (Math.max(width, height) / Math.min(width, height) > limits.maxAspectRatio) {
    problems.push("aspect_ratio");
  }
  return problems;
}

/** Megapixels shown as "X,XX MP" style numbers. */
export function megapixelsOf({ width, height }: Size): number {
  return (width * height) / ONE_MEGAPIXEL;
}
