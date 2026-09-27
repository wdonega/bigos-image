import { describe, expect, it } from "vitest";
import { mp3Duration } from "./audio";

// MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: header FF FB 90 00, 417-byte frames, 1152 samples.
function frames(count: number): Uint8Array {
  const out = new Uint8Array(count * 417);
  for (let i = 0; i < count; i++) out.set([0xff, 0xfb, 0x90, 0x00], i * 417);
  return out;
}

describe("mp3Duration", () => {
  it("counts frames: 1152 samples each at 44.1 kHz", () => {
    expect(mp3Duration(frames(100))).toBeCloseTo((100 * 1152) / 44100, 5);
  });

  it("skips an ID3v2 tag at the start", () => {
    const tag = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0xff)]);
    const data = new Uint8Array([...tag, ...frames(10)]);
    expect(mp3Duration(data)).toBeCloseTo((10 * 1152) / 44100, 5);
  });

  it("returns 0 for data without MP3 frames", () => {
    expect(mp3Duration(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(0);
  });
});
