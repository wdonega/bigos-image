import { describe, expect, it } from "vitest";
import {
  COLORS,
  COLOR_IDS,
  chunkPlan,
  cleanFilters,
  cleanSize,
  estimateLevel,
  estimateSeconds,
  parseCrop,
  parseInterlaced,
  parseProbe,
  previewFilters,
  upscaleSize,
} from "./restore";

// A DVD capture as ffprobe reports it (a.mpg of the tests: NTSC, 4:3, a DVD navigation stream first).
const dvd = {
  streams: [
    { codec_type: "data", codec_name: "dvd_nav_packet" },
    { codec_type: "video", codec_name: "mpeg2video", width: 720, height: 480, sample_aspect_ratio: "8:9", avg_frame_rate: "30000/1001" },
    { codec_type: "audio", codec_name: "mp2" },
  ],
  format: { duration: "9.064489" },
};
const info = parseProbe(dvd)!;

describe("parseProbe", () => {
  it("reads the video stream past the DVD navigation stream", () => {
    expect(info).toEqual({ width: 720, height: 480, sar: 8 / 9, codec: "mpeg2video", seconds: 9.064489, fps: 30000 / 1001, hasAudio: true });
  });

  it("applies a phone's 90° rotation to the size (ffmpeg decodes it upright)", () => {
    const phone = parseProbe({ streams: [{ codec_type: "video", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }] });
    expect(phone).toMatchObject({ width: 1080, height: 1920 });
  });

  it("treats a missing or zero pixel aspect ratio as square, and returns null without video", () => {
    const square = parseProbe({ streams: [{ codec_type: "video", width: 640, height: 480, sample_aspect_ratio: "0:1" }] });
    expect(square).toMatchObject({ sar: 1, fps: 30, hasAudio: false, seconds: 0 });
    expect(parseProbe({ streams: [{ codec_type: "audio" }] })).toBeNull();
  });
});

describe("parseCrop", () => {
  it("takes the most frequent suggestion, trims the ragged edge and the head-switching lines", () => {
    const stderr = "crop=704:464:8:6\ncrop=704:464:8:6\ncrop=720:480:0:0\n";
    expect(parseCrop(stderr, info)).toEqual({ width: 700, height: 462, x: 10, y: 6 });
  });

  it("keeps the whole frame (minus the margins) when cropdetect said nothing", () => {
    expect(parseCrop("", info)).toEqual({ width: 716, height: 468, x: 2, y: 0 });
  });

  it("does not cut head-switching lines from HD sources", () => {
    expect(parseCrop("", { width: 1920, height: 1080 })).toEqual({ width: 1916, height: 1080, x: 2, y: 0 });
  });
});

describe("parseInterlaced", () => {
  it("uses the last multi-frame summary against the 25% threshold", () => {
    const line = (t: number, b: number, p: number) => `Multi frame detection: TFF: ${t} BFF: ${b} Progressive: ${p} Undetermined: 0`;
    expect(parseInterlaced(`${line(0, 0, 300)}\n${line(296, 0, 4)}`)).toBe(true);
    expect(parseInterlaced(line(5, 3, 290))).toBe(false);
    expect(parseInterlaced("no idet output")).toBe(false);
  });
});

describe("cleanFilters", () => {
  const m = { crop: { width: 712, height: 468, x: 6, y: 0 }, interlaced: false };

  it("crops, deblocks MPEG-2, reduces noise, corrects color and goes to square pixels", () => {
    expect(cleanFilters(info, m, "normalize")).toEqual([
      "crop=712:468:6:0",
      "deblock=filter=weak:block=8",
      "nlmeans=s=2.5:p=7:r=11",
      COLORS.normalize,
      "scale=632:468:flags=lanczos",
      "setsar=1",
    ]);
  });

  it("deinterlaces only when measured, skips deblock on H.264 and color on none", () => {
    const vf = cleanFilters({ ...info, codec: "h264" }, { ...m, interlaced: true }, "none");
    expect(vf).toContain("bwdif=mode=send_field:parity=auto");
    expect(vf.some((f) => f.startsWith("deblock"))).toBe(false);
    expect(vf).toHaveLength(5);
  });

  it("previews one frame per frame at the asked width, same aspect", () => {
    const vf = previewFilters(info, { ...m, interlaced: true }, "mild", 480);
    expect(vf).toContain("bwdif=mode=send_frame:parity=auto");
    expect(vf).toContain(COLORS.mild);
    expect(vf.at(-2)).toBe("scale=480:356:flags=lanczos");
  });

  it("has a filter (or none) for every color id", () => {
    expect(COLOR_IDS.every((id) => id in COLORS)).toBe(true);
  });
});

describe("sizes", () => {
  it("cleans to square pixels and upscales to 720 on multiples of 16", () => {
    const size = cleanSize(info, { width: 712, height: 468, x: 6, y: 0 });
    expect(size).toEqual({ width: 632, height: 468 });
    expect(upscaleSize(size, 720)).toEqual({ width: 976, height: 720 });
  });
});

describe("chunkPlan", () => {
  it("splits into 4n+1 chunks and pads the last one up to 4n+1", () => {
    expect(chunkPlan(60, 33)).toEqual([
      { start: 0, frames: 33, pad: 0 },
      { start: 33, frames: 27, pad: 2 },
    ]);
    expect(chunkPlan(601, 601)).toEqual([{ start: 0, frames: 601, pad: 0 }]);
  });

  it("refuses chunk sizes SeedVR2 would not return whole", () => {
    expect(() => chunkPlan(100, 600)).toThrow(/4n\+1/);
  });
});

describe("estimates", () => {
  const factors = { upscale: 110, clean: 1.7 };

  it("multiplies the section by the mode's factor", () => {
    expect(estimateSeconds(60, "upscale", factors)).toBe(6600);
    expect(estimateSeconds(60, "clean", factors)).toBe(102);
  });

  it("raises the warning level past each threshold", () => {
    const levels = [5, 21, 41, 61, 120].map((min) => estimateLevel(min * 60, [20, 40, 60]));
    expect(levels).toEqual([0, 1, 2, 3, 3]);
    expect(estimateLevel(20 * 60, [20, 40, 60])).toBe(0);
  });
});
