import { describe, expect, it } from "vitest";
import { isMp4, readVideoInfo } from "./mp4";
import { audioTrak, box, file, ftyp, mvhd, videoTrak } from "./test-mp4";

describe("readVideoInfo", () => {
  it("reads duration, size and tracks of an MP4 with video and audio", () => {
    const data = file(ftyp, box("mdat", new Uint8Array(32)), box("moov", mvhd(1000, 5167), videoTrak(1280, 736), audioTrak()));
    expect(readVideoInfo(data)).toEqual({ seconds: 5.167, width: 1280, height: 736, rotation: 0, hasVideo: true, hasAudio: true });
  });

  it("applies a 90° rotation (portrait phone video stored as landscape)", () => {
    const data = file(ftyp, box("moov", mvhd(600, 1800), videoTrak(1920, 1080, 90)));
    expect(readVideoInfo(data)).toMatchObject({ seconds: 3, width: 1080, height: 1920, rotation: 90, hasAudio: false });
  });

  it("keeps the size on a 180° rotation", () => {
    const data = file(ftyp, box("moov", mvhd(1000, 1000), videoTrak(1920, 1080, 180)));
    expect(readVideoInfo(data)).toMatchObject({ width: 1920, height: 1080, rotation: 180 });
  });

  it("reads 64-bit mvhd (version 1)", () => {
    const data = file(ftyp, box("moov", mvhd(90000, 900000, 1), videoTrak(640, 480)));
    expect(readVideoInfo(data)?.seconds).toBe(10);
  });

  it("returns null when it is not an MP4 or has no movie box", () => {
    expect(readVideoInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readVideoInfo(file(ftyp, box("mdat", new Uint8Array(8))))).toBeNull();
  });

  it("reports a file without a video track", () => {
    const data = file(ftyp, box("moov", mvhd(1000, 2000), audioTrak()));
    expect(readVideoInfo(data)).toMatchObject({ hasVideo: false, hasAudio: true, width: 0 });
  });
});

describe("isMp4", () => {
  it("recognizes the ftyp box", () => {
    expect(isMp4(ftyp)).toBe(true);
    expect(isMp4(new Uint8Array(12))).toBe(false);
  });
});
