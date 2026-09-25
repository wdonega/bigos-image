// Generates the favicon, every app/PWA icon and the iOS launch screens.
// Sources: docs/icons/icon_warm.png (square icon) and docs/icons/logo.png (transparent logo).
// Sizes and devices come from src/lib/pwa-assets.ts. Usage: pnpm icons (outputs are committed).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import {
  APPLE_ICON_SIZES,
  FAVICON_SIZES,
  ICON_SIZES,
  MASKABLE_SIZES,
  STARTUP_DEVICES,
  THEME_COLOR,
  appleIconPath,
  faviconPath,
  iconPath,
  maskableIconPath,
  startupImagePath,
  startupPixels,
} from "../src/lib/pwa-assets.ts";

const ICON = "docs/icons/icon_warm.png";
const LOGO = "docs/icons/logo.png";

const png = (size: number) => sharp(ICON).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO container with embedded PNGs (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/**
 * Android masks icons to a shape that only keeps the central 80% circle, and the easel in the
 * source touches the corners. The maskable version shrinks the art and extends the gradient
 * background outwards (edge pixels) to fill the margin.
 */
async function maskable(size: number): Promise<Buffer> {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  return sharp(await sharp(ICON).resize(inner, inner).toBuffer())
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, extendWith: "copy" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** iOS launch screen: the transparent logo centred on the theme color. */
async function startupImage(width: number, height: number): Promise<Buffer> {
  const logoWidth = Math.round(Math.min(width, height) * 0.45);
  const logo = await sharp(LOGO).resize({ width: logoWidth }).toBuffer();
  return sharp({ create: { width, height, channels: 3, background: THEME_COLOR } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
}

const outputs: Record<string, () => Promise<Buffer>> = {
  // ICO entries are declared 32 bpp, so the embedded PNGs must be RGBA (decoders reject RGB).
  "src/app/favicon.ico": async () =>
    ico(
      await Promise.all(
        [16, 32, 48].map(async (size) => ({
          size,
          data: await sharp(ICON).resize(size, size).ensureAlpha().png().toBuffer(),
        })),
      ),
    ),
};
for (const size of FAVICON_SIZES) outputs[`public${faviconPath(size)}`] = () => png(size);
for (const size of ICON_SIZES) outputs[`public${iconPath(size)}`] = () => png(size);
for (const size of MASKABLE_SIZES) outputs[`public${maskableIconPath(size)}`] = () => maskable(size);
for (const size of APPLE_ICON_SIZES) outputs[`public${appleIconPath(size)}`] = () => png(size);
for (const device of STARTUP_DEVICES) {
  const { width, height } = startupPixels(device);
  outputs[`public${startupImagePath(device)}`] = () => startupImage(width, height);
}

// Start from clean folders so renamed or dropped sizes do not linger.
for (const dir of ["public/icons", "public/splash"]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

let total = 0;
for (const [file, render] of Object.entries(outputs)) {
  const data = await render();
  writeFileSync(file, data);
  total += data.length;
}
const count = (dir: string) => readdirSync(dir).length;
console.log(
  `favicon.ico + ${count("public/icons")} icons + ${count("public/splash")} launch screens ` +
    `(${(total / 1024 / 1024).toFixed(1)} MB)`,
);
