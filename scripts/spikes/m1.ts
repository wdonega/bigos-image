// Milestone 1 spikes (spec §14): 2048 limit, VRAM at 4 MP, PT vs EN prompts, alpha end to end.
// Usage: node --env-file=.env scripts/spikes/m1.ts [name-filter]
// Writes PNGs and report.json to storage/spikes/m1/.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ComfyClient } from "../../src/lib/comfy/client.ts";
import { outputImage, runPrompt } from "../../src/lib/comfy/run.ts";
import { getConfig } from "../../src/lib/config.ts";
import { buildPrompt } from "../../src/lib/prompt.ts";
import { presetSize } from "../../src/lib/size.ts";
import { buildT2I } from "../../src/lib/workflow/build.ts";
import { findNodeId } from "../../src/lib/workflow/graph.ts";
import { loadTemplate } from "../../src/lib/workflow/templates.ts";

type Case = { name: string; prompt: string; width: number; height: number; transparent?: boolean };

const config = getConfig();
const SEED = 42;
const s = (ratio: Parameters<typeof presetSize>[0], mp: 1 | 2 | 4) =>
  presetSize(ratio, mp, config.maxPixels);

const bike = {
  en: "A red vintage bicycle leaning against a yellow wall on a sunny street, photorealistic",
  pt: "Uma bicicleta vintage vermelha encostada em uma parede amarela numa rua ensolarada, fotorrealista",
};
const cafe = {
  en: "A cozy coffee shop interior with wooden tables, warm light, plants and a chalkboard menu that says 'Café do Zé'",
  pt: "Interior de uma cafeteria aconchegante com mesas de madeira, luz quente, plantas e um quadro-negro escrito 'Café do Zé'",
};
const owl = {
  en: "A cute cartoon owl reading a book, flat illustration",
  pt: "Uma coruja fofa de desenho animado lendo um livro, ilustração plana",
};
const apple = { en: "a shiny red apple with a green leaf", pt: "uma maçã vermelha brilhante com uma folha verde" };
const trophy = { en: "a golden trophy cup", pt: "uma taça de troféu dourada" };

const cases: Case[] = [
  { name: "size-1x1-1mp", prompt: bike.en, ...s("1:1", 1) },
  { name: "size-1x1-4mp", prompt: bike.en, ...s("1:1", 4) },
  { name: "size-16x9-4mp", prompt: bike.en, ...s("16:9", 4) },
  { name: "size-9x16-4mp", prompt: bike.en, ...s("9:16", 4) },
  ...[bike, cafe, owl].flatMap((p, i) => [
    { name: `lang-${i + 1}-en`, prompt: p.en, ...s("1:1", 1) },
    { name: `lang-${i + 1}-pt`, prompt: p.pt, ...s("1:1", 1) },
  ]),
  ...[apple, trophy].flatMap((p, i) => [
    { name: `alpha-${i + 1}-en`, prompt: p.en, transparent: true, ...s("1:1", 1) },
    { name: `alpha-${i + 1}-pt`, prompt: p.pt, transparent: true, ...s("1:1", 1) },
  ]),
];

const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;
const outDir = path.resolve(config.storageDir, "spikes", "m1");
mkdirSync(outDir, { recursive: true });

const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-spike-${Date.now()}` });

async function vramFree(): Promise<number | null> {
  const stats = (await client.systemStats()) as { devices?: { vram_free?: number }[] };
  return stats.devices?.[0]?.vram_free ?? null;
}

async function alphaStats(png: Buffer) {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return { channels: meta.channels, hasAlpha: false, alphaBelow255: 0, alphaBelow16: 0 };
  const alpha = await sharp(png).extractChannel(3).raw().toBuffer();
  let below255 = 0;
  let below16 = 0;
  for (const a of alpha) {
    if (a < 255) below255++;
    if (a < 16) below16++;
  }
  return {
    channels: meta.channels,
    hasAlpha: true,
    alphaBelow255: below255 / alpha.length,
    alphaBelow16: below16 / alpha.length,
  };
}

const report: Record<string, unknown>[] = [];
for (const c of selected) {
  const template = loadTemplate("t2i");
  const graph = buildT2I(template, {
    prompt: buildPrompt(c.prompt, c.transparent ?? false),
    width: c.width,
    height: c.height,
    seed: SEED,
    steps: config.steps.normal,
  });
  const vramBefore = await vramFree();
  const t0 = Date.now();
  process.stdout.write(`${c.name} ${c.width}x${c.height} `);
  try {
    const { promptId, entry } = await runPrompt(client, graph, {
      timeoutMs: config.jobTimeoutMs,
      onProgress: (p) => process.stdout.write(p.phase === "running" ? "." : "w"),
    });
    const seconds = (Date.now() - t0) / 1000;
    const ref = outputImage(entry, findNodeId(graph, "@save"));
    const png = await client.view(ref);
    writeFileSync(path.join(outDir, `${c.name}.png`), png);
    const meta = await sharp(png).metadata();
    const row = {
      name: c.name,
      promptId,
      requested: `${c.width}x${c.height}`,
      output: `${meta.width}x${meta.height}`,
      format: meta.format,
      seconds,
      vramFreeBefore: vramBefore,
      vramFreeAfter: await vramFree(),
      outputsKeys: Object.keys(entry.outputs ?? {}),
      ref,
      ...(await alphaStats(png)),
    };
    report.push(row);
    console.log(` ok ${seconds.toFixed(1)}s`, JSON.stringify(row));
  } catch (err) {
    report.push({ name: c.name, error: String(err), details: (err as { details?: unknown }).details });
    console.log(" FAILED", err, (err as { details?: unknown }).details);
  }
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
}
