import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { fitToBudget, prepareImage } from "./uploads";

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
    expect(out.warnings[0]).toMatch(/reduzida/);
  });

  it("enlarges images with a short side below MIN_SIDE and warns", async () => {
    const out = await prepareImage(await image(300, 200, "webp"), limits);
    expect(out).toMatchObject({ sentWidth: 768, sentHeight: 512 });
    expect(out.warnings[0]).toMatch(/ampliada/);
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
