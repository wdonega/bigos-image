import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATE_SELECTION,
  allowedMegapixels,
  changeRatio,
  differentAspect,
  roundSide,
  selectionProblems,
  selectionSize,
  toRequestSize,
} from "./size-selection";

const limits = { maxPixels: 4_194_304, minSide: 512, maxAspectRatio: 4 };

describe("size selection", () => {
  it("defaults to 1:1 · 1 MP = 1024 × 1024", () => {
    expect(selectionSize(DEFAULT_GENERATE_SELECTION, limits.maxPixels)).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(toRequestSize(DEFAULT_GENERATE_SELECTION)).toEqual({ ratio: "1:1", megapixels: 1 });
  });

  it("pre-fills Manual with the current preset size", () => {
    const preset = { ...DEFAULT_GENERATE_SELECTION, ratio: "16:9" as const, megapixels: 2 as const };
    const manual = changeRatio(preset, "manual", limits);
    expect(manual).toMatchObject({ ratio: "manual", width: 1920, height: 1088 });
    expect(toRequestSize(manual)).toEqual({ ratio: "manual", width: 1920, height: 1088 });
  });

  it("pre-fills Manual with the original image size on Editar", () => {
    const original = changeRatio(DEFAULT_GENERATE_SELECTION, "original", limits);
    const manual = changeRatio(original, "manual", limits, { width: 1216, height: 800 });
    expect(manual).toMatchObject({ width: 1216, height: 800 });
  });

  it("only offers resolutions that fit the limits", () => {
    expect(allowedMegapixels("16:9", limits)).toEqual([1, 2, 4]);
    expect(allowedMegapixels("16:9", { ...limits, maxPixels: 2_200_000 })).toEqual([1, 2]);
  });

  it("falls back to the largest allowed resolution when the ratio changes", () => {
    const small = { ...limits, maxPixels: 2_200_000 };
    const big = { ...DEFAULT_GENERATE_SELECTION, megapixels: 4 as const };
    expect(changeRatio(big, "16:9", small).megapixels).toBe(2);
  });

  it("reports Manual problems live", () => {
    const manual = { ...DEFAULT_GENERATE_SELECTION, ratio: "manual" as const, width: 1000, height: 400 };
    expect(selectionProblems(manual, limits)).toEqual(["not_multiple", "below_min_side"]);
    expect(selectionProblems({ ...manual, width: 1280, height: 736 }, limits)).toEqual([]);
  });

  it("rounds typed sides to multiples of 32", () => {
    expect(roundSide(1000)).toBe(992);
    expect(roundSide(1010)).toBe(1024);
    expect(roundSide(Number.NaN)).toBe(32);
  });

  it("detects a changed proportion", () => {
    expect(differentAspect({ width: 1024, height: 768 }, { width: 1184, height: 896 })).toBe(false);
    expect(differentAspect({ width: 1024, height: 1024 }, { width: 1184, height: 896 })).toBe(true);
  });
});
