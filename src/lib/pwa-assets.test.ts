import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";
import {
  APPLE_ICON_SIZES,
  FAVICON_SIZES,
  STARTUP_DEVICES,
  appleIconPath,
  faviconPath,
  startupImagePath,
  startupPixels,
} from "./pwa-assets";

// Generated files must exist with the size they are declared with (run `pnpm icons` otherwise).
const publicFile = (url: string) => path.join(process.cwd(), "public", url);

async function sizeOf(url: string) {
  const file = publicFile(url);
  expect(existsSync(file), `${url} is missing; run pnpm icons`).toBe(true);
  const meta = await sharp(file).metadata();
  return `${meta.width}x${meta.height}`;
}

describe("PWA assets", () => {
  it("every manifest icon exists with its declared size", async () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(10);
    for (const icon of icons) expect(await sizeOf(icon.src), icon.src).toBe(icon.sizes);
  });

  it("covers Android maskable icons at 192 and 512", () => {
    const maskable = (manifest().icons ?? []).filter((i) => i.purpose === "maskable").map((i) => i.sizes);
    expect(maskable).toEqual(["192x192", "512x512"]);
  });

  it("has every iOS touch icon and favicon", async () => {
    for (const size of APPLE_ICON_SIZES) expect(await sizeOf(appleIconPath(size))).toBe(`${size}x${size}`);
    for (const size of FAVICON_SIZES) expect(await sizeOf(faviconPath(size))).toBe(`${size}x${size}`);
  });

  it("has an iOS launch screen for every device, at its exact pixel size", async () => {
    const paths = new Set(STARTUP_DEVICES.map(startupImagePath));
    expect(paths.size).toBe(STARTUP_DEVICES.length);
    for (const device of STARTUP_DEVICES) {
      const { width, height } = startupPixels(device);
      expect(await sizeOf(startupImagePath(device)), device.name).toBe(`${width}x${height}`);
    }
  });
});
