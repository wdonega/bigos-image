// Generates the favicon, app icons and PWA icons from docs/icons/icon_warm.png.
// Usage: pnpm icons   (outputs are committed; rerun only when the source icon changes)
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "docs/icons/icon_warm.png";

const png = (size: number) => sharp(SOURCE).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

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
 * background outwards to fill the margin.
 */
async function maskable(size: number): Promise<Buffer> {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  return sharp(await sharp(SOURCE).resize(inner, inner).toBuffer())
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, extendWith: "copy" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

mkdirSync("public/icons", { recursive: true });
const outputs: Record<string, Buffer> = {
  // ICO entries are declared 32 bpp, so the embedded PNGs must be RGBA (decoders reject RGB).
  "src/app/favicon.ico": ico(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await sharp(SOURCE).resize(size, size).ensureAlpha().png().toBuffer(),
      })),
    ),
  ),
  "src/app/icon.png": await png(512),
  "src/app/apple-icon.png": await png(180),
  "public/icons/icon-192.png": await png(192),
  "public/icons/icon-512.png": await png(512),
  "public/icons/icon-maskable-512.png": await maskable(512),
};
for (const [file, data] of Object.entries(outputs)) {
  writeFileSync(file, data);
  console.log(`${file} (${(data.length / 1024).toFixed(0)} KB)`);
}
