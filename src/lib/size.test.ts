import { describe, expect, it } from "vitest";
import { type Megapixels, type PresetRatio, checkSize, presetSize } from "./size";

const MAX_PIXELS = 4_194_304;
const limits = { maxPixels: MAX_PIXELS, minSide: 512, maxAspectRatio: 4 };

// Table from spec §5 (width × height).
const TABLE: Record<PresetRatio, Record<Megapixels, string>> = {
  "1:1": { 1: "1024x1024", 2: "1440x1440", 4: "2048x2048" },
  "4:3": { 1: "1184x896", 2: "1664x1248", 4: "2368x1760" },
  "3:4": { 1: "896x1184", 2: "1248x1664", 4: "1760x2368" },
  "16:9": { 1: "1376x768", 2: "1920x1088", 4: "2720x1536" },
  "9:16": { 1: "768x1376", 2: "1088x1920", 4: "1536x2720" },
  "3:2": { 1: "1248x832", 2: "1760x1184", 4: "2496x1664" },
  "2:3": { 1: "832x1248", 2: "1184x1760", 4: "1664x2496" },
};

describe("presetSize", () => {
  for (const [ratio, row] of Object.entries(TABLE)) {
    for (const [mp, expected] of Object.entries(row)) {
      it(`${ratio} · ${mp} MP = ${expected}`, () => {
        const size = presetSize(ratio as PresetRatio, Number(mp) as Megapixels, MAX_PIXELS);
        expect(`${size.width}x${size.height}`).toBe(expected);
        expect(checkSize(size, limits)).toEqual([]);
      });
    }
  }

  it("falls back to floor32 when rounding exceeds the pixel limit", () => {
    // 4:3 · 4 MP rounds to 2368 × 1760 (4,167,680 px); with a 4,150,000 limit floor32 applies.
    expect(presetSize("4:3", 4, 4_150_000)).toEqual({ width: 2336, height: 1760 });
  });
});

describe("checkSize", () => {
  it("accepts the Manual example from §13 (1280 × 736)", () => {
    expect(checkSize({ width: 1280, height: 736 }, limits)).toEqual([]);
  });

  it("rejects non-multiples of 32", () => {
    expect(checkSize({ width: 1000, height: 736 }, limits)).toEqual(["not_multiple"]);
  });

  it("rejects sides below the minimum", () => {
    expect(checkSize({ width: 480, height: 736 }, limits)).toEqual(["below_min_side"]);
  });

  it("rejects sizes above the pixel limit", () => {
    expect(checkSize({ width: 2080, height: 2048 }, limits)).toEqual(["above_max_pixels"]);
  });

  it("rejects extreme aspect ratios", () => {
    expect(checkSize({ width: 512, height: 2560 }, limits)).toEqual(["aspect_ratio"]);
    expect(checkSize({ width: 512, height: 2048 }, limits)).toEqual([]);
  });

  it("rejects non-integers alone", () => {
    expect(checkSize({ width: 1024.5, height: 1024 }, limits)).toEqual(["not_integer"]);
  });
});
