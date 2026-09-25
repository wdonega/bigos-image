// Marco 3 spikes (spec §14) through the app's HTTP API (needs `pnpm dev` and the M1 spike images).
// Usage: node scripts/spikes/m3.ts [name-filter] [base-url]
// Covers: resolution = 0 / Original sizes, image injection with 2 and 10 images, VRAM with
// 10 references, references with another proportion, editing with another proportion.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const filter = process.argv[2] ?? "";
const base = process.argv[3] ?? "http://localhost:3000";
const m1 = path.resolve("storage/spikes/m1");
const outDir = path.resolve("storage/spikes/m3");
mkdirSync(outDir, { recursive: true });

type Upload = { id: string; width: number; height: number; sentWidth: number; sentHeight: number; warnings: string[] };

async function upload(png: Buffer, name: string): Promise<Upload> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(png)]), name);
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`upload ${name}: ${JSON.stringify(body)}`);
  return body as Upload;
}

const src = (name: string) => sharp(path.join(m1, `${name}.png`));
const images = {
  bike43: () => src("size-1x1-1mp").resize(1000, 750, { fit: "cover" }).png().toBuffer(),
  bikeWide: () => src("size-16x9-4mp").png().toBuffer(),
  cafeHuge: () => src("lang-2-en").resize(3000, 2000, { fit: "cover" }).jpeg().toBuffer(),
  owlTiny: () => src("lang-3-en").resize(300, 300).png().toBuffer(),
  owl: () => src("lang-3-en").png().toBuffer(),
  cafe: () => src("lang-2-en").png().toBuffer(),
  apple: () => src("alpha-1-en").flatten({ background: "#ffffff" }).png().toBuffer(),
  trophy: () => src("alpha-2-en").flatten({ background: "#ffffff" }).png().toBuffer(),
  bike: () => src("size-1x1-1mp").png().toBuffer(),
  bike4mp: () => src("size-1x1-4mp").png().toBuffer(),
  bike2mp: () => src("size-1x1-4mp").resize(1440, 1440).png().toBuffer(),
};

type Case = {
  name: string;
  screen: "generate" | "edit";
  prompt: string;
  images: (keyof typeof images)[];
  size: Record<string, unknown>;
  expect?: (u: Upload[]) => string;
};

const tenSmall: (keyof typeof images)[] = ["owl", "cafe", "apple", "trophy", "bike", "owl", "cafe", "apple", "trophy", "bike"];
const cases: Case[] = [
  { name: "edit-original-43", screen: "edit", prompt: "Troque a parede amarela por uma parede de tijolos vermelhos", images: ["bike43"], size: { ratio: "original" }, expect: (u) => `${u[0].sentWidth}x${u[0].sentHeight}` },
  { name: "edit-original-huge", screen: "edit", prompt: "Deixe a cena à noite, com luzes acesas", images: ["cafeHuge"], size: { ratio: "original" }, expect: (u) => `${u[0].sentWidth}x${u[0].sentHeight}` },
  { name: "edit-original-tiny", screen: "edit", prompt: "Coloque um chapéu de mago na coruja", images: ["owlTiny"], size: { ratio: "original" }, expect: (u) => `${u[0].sentWidth}x${u[0].sentHeight}` },
  { name: "edit-ratio-1x1", screen: "edit", prompt: "Troque a parede amarela por uma parede azul", images: ["bike43"], size: { ratio: "1:1", megapixels: 1 }, expect: () => "1024x1024" },
  { name: "edit-ratio-16x9", screen: "edit", prompt: "Troque a parede amarela por uma parede azul", images: ["bike43"], size: { ratio: "16:9", megapixels: 1 }, expect: () => "1376x768" },
  { name: "edit-ratio-9x16", screen: "edit", prompt: "Troque a parede amarela por uma parede azul", images: ["bike43"], size: { ratio: "9:16", megapixels: 1 }, expect: () => "768x1376" },
  { name: "refs-2", screen: "generate", prompt: "A coruja da [Imagem 1] sentada numa mesa da cafeteria da [Imagem 2]", images: ["owl", "cafe"], size: { ratio: "1:1", megapixels: 1 }, expect: () => "1024x1024" },
  { name: "refs-2-swapped", screen: "generate", prompt: "A coruja da [Imagem 2] sentada numa mesa da cafeteria da [Imagem 1]", images: ["cafe", "owl"], size: { ratio: "1:1", megapixels: 1 }, expect: () => "1024x1024" },
  { name: "refs-aspect", screen: "generate", prompt: "A bicicleta da [Imagem 1] estacionada numa rua de paralelepípedos", images: ["bikeWide"], size: { ratio: "9:16", megapixels: 1 }, expect: () => "768x1376" },
  { name: "refs-10-1mp", screen: "generate", prompt: "Uma vitrine de loja com todos estes objetos: [Imagem 1], [Imagem 3], [Imagem 4], [Imagem 5]", images: tenSmall, size: { ratio: "16:9", megapixels: 1 }, expect: () => "1376x768" },
  { name: "refs-10-4mp", screen: "generate", prompt: "Uma colagem com as imagens [Imagem 1] e [Imagem 2]", images: ["bike4mp", "bikeWide", "bike4mp", "bikeWide", "bike4mp", "bikeWide", "bike4mp", "bikeWide", "bike4mp", "bikeWide"], size: { ratio: "1:1", megapixels: 4 }, expect: () => "2048x2048" },
  { name: "refs-10-2mp", screen: "generate", prompt: "Uma colagem com as imagens [Imagem 1] e [Imagem 2]", images: Array.from({ length: 10 }, () => "bike2mp" as const), size: { ratio: "1:1", megapixels: 1 }, expect: () => "1024x1024" },
];

for (const c of cases.filter((x) => x.name.includes(filter))) {
  const t0 = Date.now();
  try {
    const uploads: Upload[] = [];
    for (const key of c.images) uploads.push(await upload(await images[key](), `${key}.png`));
    const res = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: c.screen, prompt: c.prompt, images: uploads.map((u) => u.id), size: c.size }),
    });
    const created = await res.json();
    if (!res.ok) throw new Error(`job: ${JSON.stringify(created)}`);
    let view: { status: string; imageUrl?: string; error?: unknown };
    for (;;) {
      view = await (await fetch(`${base}/api/jobs/${created.job_id}`)).json();
      if (["done", "failed", "cancelled"].includes(view.status)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    if (view.status !== "done") {
      console.log(`${c.name}: ${view.status} ${JSON.stringify(view.error)} (${seconds}s)`);
      continue;
    }
    const png = Buffer.from(await (await fetch(`${base}${view.imageUrl}`)).arrayBuffer());
    writeFileSync(path.join(outDir, `${c.name}.png`), png);
    const meta = await sharp(png).metadata();
    const got = `${meta.width}x${meta.height}`;
    const expected = c.expect?.(uploads) ?? "?";
    console.log(
      `${c.name}: ${got === expected ? "OK" : "MISMATCH"} got ${got} expected ${expected} (${seconds}s)`,
      uploads.map((u) => `${u.width}x${u.height}→${u.sentWidth}x${u.sentHeight}${u.warnings.length ? " (warn)" : ""}`).join(", "),
    );
  } catch (err) {
    console.log(`${c.name}: ERROR ${String(err)}`);
  }
}
