import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { testConfig } from "./test-config";
import { mp4 } from "./test-mp4";
import { fitToBudget, prepareImage, readUploadFrame, readUploadMeta, readUploadVideo, saveVideoUpload } from "./uploads";

const limits = { maxInputPixels: 4_194_304, minSide: 512 };

const image = (width: number, height: number, format: "png" | "jpeg" | "webp" | "gif" = "png") =>
  sharp({ create: { width, height, channels: 3, background: "#3366aa" } })
    .toFormat(format)
    .toBuffer();

describe("prepareImage", () => {
  it("keeps images that already fit, cropping to multiples of 32", async () => {
    const out = await prepareImage(await image(1000, 750, "jpeg"), limits);
    expect(out).toMatchObject({ width: 1000, height: 750, sentWidth: 992, sentHeight: 736, warnings: [] });
    const meta = await sharp(out.png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 992, 736]);
  });

  it("reduces images above the input pixel limit and warns", async () => {
    const out = await prepareImage(await image(4000, 3000), limits);
    expect(out.sentWidth * out.sentHeight).toBeLessThanOrEqual(limits.maxInputPixels);
    expect(out.sentWidth % 32).toBe(0);
    expect(out.sentHeight % 32).toBe(0);
    expect(out.sentWidth / out.sentHeight).toBeCloseTo(4 / 3, 1);
    expect(out.warnings).toEqual([{ code: "image_reduced", params: { width: out.sentWidth, height: out.sentHeight } }]);
  });

  it("enlarges images with a short side below MIN_SIDE and warns", async () => {
    const out = await prepareImage(await image(300, 200, "webp"), limits);
    expect(out).toMatchObject({ sentWidth: 768, sentHeight: 512 });
    expect(out.warnings).toEqual([{ code: "image_enlarged", params: { width: 768, height: 512 } }]);
  });

  it("rejects formats other than PNG, JPG and WebP", async () => {
    await expect(prepareImage(await image(600, 600, "gif"), limits)).rejects.toBeInstanceOf(AppError);
    await expect(prepareImage(Buffer.from("not an image"), limits)).rejects.toMatchObject({
      code: "invalid_image",
    });
  });
});

describe("fitToBudget", () => {
  const sent = async (w: number, h: number) => ({ png: await image(w, h), width: w, height: h });

  it("leaves images within the budget untouched", async () => {
    const images = [await sent(1024, 1024), await sent(1024, 1024)];
    const out = await fitToBudget(images, 4_194_304);
    expect(out.reduced).toBe(false);
    expect(out.images).toBe(images);
  });

  it("scales every image by the same factor to fit the total budget", async () => {
    const images = [await sent(2048, 2048), await sent(2048, 1024)];
    const out = await fitToBudget(images, 3_000_000);
    expect(out.reduced).toBe(true);
    const total = out.images.reduce((s, i) => s + i.width * i.height, 0);
    expect(total).toBeLessThanOrEqual(3_000_000);
    for (const i of out.images) {
      expect(i.width % 32).toBe(0);
      const meta = await sharp(i.png).metadata();
      expect([meta.width, meta.height]).toEqual([i.width, i.height]);
    }
    expect(out.images[0].width / out.images[1].width).toBeCloseTo(1, 1);
  });
});

describe("saveVideoUpload (spec §14, decision 31)", () => {
  const withDir = async () => ({ ...testConfig, storageDir: await mkdtemp(path.join(tmpdir(), "bigos-uploads-")) });

  it("stores the video as received with its header facts", async () => {
    const config = await withDir();
    const meta = await saveVideoUpload(config, mp4(4, 1280, 736, { audio: true }), null);
    expect(meta).toMatchObject({ kind: "video", ext: "mp4", width: 1280, height: 736, seconds: 4, hasAudio: true, hasFrame: false, warnings: [] });
    expect((await readUploadVideo(config, meta))?.length).toBe(mp4(4, 1280, 736, { audio: true }).length);
    expect(await readUploadMeta(config, meta.id)).toEqual(meta);
  });

  it("keeps MOV files as .mov and applies the rotation", async () => {
    const config = await withDir();
    const meta = await saveVideoUpload(config, mp4(3, 1920, 1080, { mov: true, rotation: 90 }), null);
    expect(meta).toMatchObject({ ext: "mov", width: 1080, height: 1920, hasAudio: false });
    expect(await readUploadVideo(config, meta)).not.toBeNull();
  });

  it("warns that a long video will be trimmed to EFFECT_MAX_SECONDS", async () => {
    const meta = await saveVideoUpload(await withDir(), mp4(12, 640, 480), null);
    expect(meta.warnings).toEqual([{ code: "video_trimmed", params: { seconds: 5 } }]);
  });

  it("stores the first frame normalized like an image upload", async () => {
    const config = await withDir();
    const meta = await saveVideoUpload(config, mp4(4, 1280, 736), await image(1280, 736));
    expect(meta.hasFrame).toBe(true);
    const frame = await readUploadFrame(config, meta.id);
    expect((await sharp(frame!).metadata()).format).toBe("png");
  });

  it("ignores an unreadable frame instead of refusing the video", async () => {
    const meta = await saveVideoUpload(await withDir(), mp4(4, 640, 480), Buffer.from("nope"));
    expect(meta.hasFrame).toBe(false);
  });

  it("refuses files that are not videos, too short or too large", async () => {
    const config = await withDir();
    await expect(saveVideoUpload(config, Buffer.from("not a video at all"), null)).rejects.toMatchObject({ code: "invalid_video" });
    await expect(saveVideoUpload(config, mp4(0.5, 640, 480), null)).rejects.toMatchObject({
      code: "invalid_video",
      details: [{ code: "video_too_short", params: { min: 1 } }],
    });
    const small = { ...config, effects: { ...config.effects, maxUploadBytes: 10 } };
    await expect(saveVideoUpload(small, mp4(4, 640, 480), null)).rejects.toBeInstanceOf(AppError);
  });
});
