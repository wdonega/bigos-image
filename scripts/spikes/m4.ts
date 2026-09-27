// Milestone 4 spike (spec §14, transparency on the edit workflow): does the RGBA wrap work in the edit
// workflow, with and without references? Needs `pnpm dev` and the M1 spike images.
// Usage: node scripts/spikes/m4.ts [name-filter] [base-url]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const filter = process.argv[2] ?? "";
const base = process.argv[3] ?? "http://localhost:3000";
const m1 = path.resolve("storage/spikes/m1");
const outDir = path.resolve("storage/spikes/m4");
mkdirSync(outDir, { recursive: true });

async function upload(png: Buffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(png)]), "image.png");
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.id;
}

async function alphaBelow16(png: Buffer): Promise<number | null> {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return null;
  const alpha = await sharp(png).extractChannel(3).raw().toBuffer();
  return alpha.filter((a) => a < 16).length / alpha.length;
}

const src = (name: string) => sharp(path.join(m1, `${name}.png`)).flatten({ background: "#ffffff" }).png().toBuffer();

const cases = [
  { name: "edit-keep-subject", screen: "edit", images: ["size-1x1-1mp"], prompt: "Mantenha só a bicicleta" },
  { name: "edit-change-color", screen: "edit", images: ["size-1x1-1mp"], prompt: "Deixe a bicicleta azul" },
  { name: "edit-photo-explicit-en", screen: "edit", images: ["size-1x1-1mp"], prompt: "Keep only the red bicycle from <image1> and remove the yellow wall and the street completely" },
  { name: "edit-owl-hat", screen: "edit", images: ["lang-3-en"], prompt: "Coloque um chapéu de mago na coruja" },
  { name: "refs-owl-waving", screen: "generate", images: ["lang-3-en"], prompt: "A coruja da [Imagem 1] acenando" },
  { name: "refs-2-objects", screen: "generate", images: ["lang-3-en", "alpha-2-en"], prompt: "A coruja da [Imagem 1] segurando o troféu da [Imagem 2]" },
];

for (const c of cases.filter((x) => x.name.includes(filter))) {
  const t0 = Date.now();
  const ids = [];
  for (const name of c.images) ids.push(await upload(await src(name)));
  const res = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      screen: c.screen,
      prompt: c.prompt,
      images: ids,
      size: c.screen === "edit" ? { ratio: "original" } : { ratio: "1:1", megapixels: 1 },
      transparent_background: true,
    }),
  });
  const { job_id } = await res.json();
  let view: { status: string; url?: string; error?: unknown };
  for (;;) {
    view = await (await fetch(`${base}/api/jobs/${job_id}`)).json();
    if (["done", "failed", "cancelled"].includes(view.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  if (view.status !== "done") {
    console.log(`${c.name}: ${view.status} ${JSON.stringify(view.error)}`);
    continue;
  }
  const png = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
  writeFileSync(path.join(outDir, `${c.name}.png`), png);
  const fraction = await alphaBelow16(png);
  console.log(`${c.name}: alpha<16 = ${fraction === null ? "no alpha" : `${(fraction * 100).toFixed(1)}%`} (${seconds}s)`);
}
