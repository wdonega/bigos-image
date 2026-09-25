import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { finalizeImage } from "./worker";

async function rgbaPng(alpha: number) {
  return sharp({
    create: { width: 64, height: 32, channels: 4, background: { r: 200, g: 10, b: 10, alpha: alpha / 255 } },
  })
    .png()
    .toBuffer();
}

describe("finalizeImage", () => {
  it("drops the noisy alpha channel of opaque results", async () => {
    const out = await finalizeImage(await rgbaPng(240), false);
    const meta = await sharp(out.png).metadata();
    expect(meta.hasAlpha).toBe(false);
    expect(out).toMatchObject({ width: 64, height: 32 });
  });

  it("delivers transparent results untouched", async () => {
    const png = await rgbaPng(0);
    const out = await finalizeImage(png, true);
    expect(out.png).toBe(png);
    expect(out).toMatchObject({ width: 64, height: 32 });
  });
});
