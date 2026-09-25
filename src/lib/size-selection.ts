// State of the size picker (spec §5) and how it maps to an output size. Pure; used by the UI.
import {
  MEGAPIXEL_OPTIONS,
  type Megapixels,
  type PresetRatio,
  SIZE_MULTIPLE,
  type Size,
  type SizeLimits,
  type SizeProblem,
  checkSize,
  presetSize,
  round32,
} from "./size.ts";

export type RatioChoice = PresetRatio | "manual" | "original";

export type SizeSelection = {
  ratio: RatioChoice;
  megapixels: Megapixels;
  /** Manual fields; kept while a preset is selected so switching back restores them. */
  width: number;
  height: number;
};

export const DEFAULT_GENERATE_SELECTION: SizeSelection = {
  ratio: "1:1",
  megapixels: 1,
  width: 1024,
  height: 1024,
};

export const MEGAPIXEL_LABELS: Record<Megapixels, string> = { 1: "Pequeno", 2: "Médio", 4: "Grande" };

/** The output size of a selection; null for "Original" while no image is loaded. */
export function selectionSize(
  sel: SizeSelection,
  maxPixels: number,
  original: Size | null = null,
): Size | null {
  if (sel.ratio === "manual") return { width: sel.width, height: sel.height };
  if (sel.ratio === "original") return original;
  return presetSize(sel.ratio, sel.megapixels, maxPixels);
}

/** Size rules broken by the selection. "Original" is sized by the backend and never fails here. */
export function selectionProblems(sel: SizeSelection, limits: SizeLimits): SizeProblem[] {
  if (sel.ratio === "original") return [];
  const size = selectionSize(sel, limits.maxPixels);
  return size ? checkSize(size, limits) : [];
}

/** Resolutions whose preset for this ratio fits the configured limits. */
export function allowedMegapixels(ratio: PresetRatio, limits: SizeLimits): Megapixels[] {
  return MEGAPIXEL_OPTIONS.filter(
    (mp) => checkSize(presetSize(ratio, mp, limits.maxPixels), limits).length === 0,
  );
}

/** Switching to Manual pre-fills the fields with the current size (spec §5). */
export function changeRatio(
  sel: SizeSelection,
  ratio: RatioChoice,
  limits: SizeLimits,
  original: Size | null = null,
): SizeSelection {
  if (ratio === "manual") {
    const current = selectionSize(sel, limits.maxPixels, original);
    return { ...sel, ratio, ...(current ?? {}) };
  }
  if (ratio === "original") return { ...sel, ratio };
  const allowed = allowedMegapixels(ratio, limits);
  const megapixels = allowed.includes(sel.megapixels) ? sel.megapixels : (allowed.at(-1) ?? sel.megapixels);
  return { ...sel, ratio, megapixels };
}

/** Rounds a typed side to the nearest multiple of 32 (when the field loses focus). */
export function roundSide(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return SIZE_MULTIPLE;
  return Math.max(SIZE_MULTIPLE, round32(value));
}

export type RequestSize =
  | { ratio: PresetRatio; megapixels: Megapixels }
  | { ratio: "manual"; width: number; height: number }
  | { ratio: "original" };

export function toRequestSize(sel: SizeSelection): RequestSize {
  if (sel.ratio === "manual") return { ratio: "manual", width: sel.width, height: sel.height };
  if (sel.ratio === "original") return { ratio: "original" };
  return { ratio: sel.ratio, megapixels: sel.megapixels };
}

/** True when two sizes differ in proportion by more than 3% (used to warn on the Editar screen). */
export function differentAspect(a: Size, b: Size): boolean {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb > 0.03;
}
