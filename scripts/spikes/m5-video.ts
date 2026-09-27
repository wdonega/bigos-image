// Video spikes (spec §14, decision 28): native MiniMax H3 graphs — time, VRAM and output format.
// Usage: node --env-file=.env scripts/spikes/m5-video.ts [name-filter]
// Writes MP4s and report.json to storage/spikes/m5/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComfyClient } from "../../src/lib/comfy/client.ts";
import { runPrompt } from "../../src/lib/comfy/run.ts";
import { getConfig } from "../../src/lib/config.ts";
import { type ApiGraph, findNodeId } from "../../src/lib/workflow/graph.ts";

type Case = { name: string; file: string; width: number; height: number; length: number; prompt: string; ref?: string };

const config = getConfig();
const PROMPT = `detailed_description: Live-action, cinematic. A golden retriever runs along a sunny beach at the water's edge, splashing through small waves, the camera tracking alongside at dog height. Warm late-afternoon light, gentle sea spray, soft focus background of dunes.

overall_soundscape: waves breaking softly, paws splashing in shallow water, a happy bark, light wind.

non_diegetic_music: N/A`;
const REF_PROMPT = `subject_definitions:
<Subject 1> is the cat painter shown in <Picture 1>.

summary: [reference generation] The target video follows <Subject 1> painting at an easel.

detailed_description: Animated, cozy. <Subject 1> dips a brush into the palette and paints a paw print on the canvas, then looks at the camera and smiles. Warm studio light.

overall_soundscape: soft brush strokes on canvas, a quiet purr, room tone.

non_diegetic_music: soft playful piano`;

const cases: Case[] = [
  { name: "t2v-720p-5s", file: "video_fl2va_api.json", width: 1280, height: 704, length: 124, prompt: PROMPT },
  { name: "t2v-1080p-5s", file: "video_fl2va_api.json", width: 1920, height: 1088, length: 124, prompt: PROMPT },
  { name: "t2v-720p-10s", file: "video_fl2va_api.json", width: 1280, height: 704, length: 243, prompt: PROMPT },
  { name: "ref-720p-5s", file: "video_ref2va_api.json", width: 1280, height: 704, length: 124, prompt: REF_PROMPT, ref: "docs/icons/icon_warm.png" },
];

const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;
const outDir = path.resolve(config.storageDir, "spikes", "m5");
mkdirSync(outDir, { recursive: true });
const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-spike-${Date.now()}`, timeoutMs: 120_000 });

async function vramFree(): Promise<number | null> {
  const stats = (await client.systemStats()) as { devices?: { vram_free?: number }[] };
  return stats.devices?.[0]?.vram_free ?? null;
}

const report: Record<string, unknown>[] = [];
for (const c of selected) {
  const graph = JSON.parse(readFileSync(path.join("workflows", "api", c.file), "utf8")) as ApiGraph;
  const video = graph[findNodeId(graph, "@video")];
  Object.assign(video.inputs, { prompt: c.prompt, width: c.width, height: c.height, length: c.length });
  graph[findNodeId(graph, "@seed")].inputs.noise_seed = 42;
  if (c.ref) {
    const name = await client.uploadImage(readFileSync(c.ref), `bigos-spike-ref.png`);
    graph[findNodeId(graph, "@image_1")].inputs.image = name;
  }
  const vramBefore = await vramFree();
  const t0 = Date.now();
  process.stdout.write(`${c.name} ${c.width}x${c.height}x${c.length} `);
  try {
    const { entry } = await runPrompt(client, graph, {
      timeoutMs: 40 * 60_000,
      onProgress: (p) => process.stdout.write(p.phase === "running" ? "." : "w"),
    });
    const seconds = (Date.now() - t0) / 1000;
    const out = (entry.outputs ?? {})[findNodeId(graph, "@save")] as Record<string, unknown>;
    const files = (out?.gifs ?? out?.videos ?? out?.images) as { filename: string; subfolder: string; type: string }[];
    const mp4 = await client.view(files[0]);
    writeFileSync(path.join(outDir, `${c.name}.mp4`), mp4);
    const row = { name: c.name, seconds, vramBefore, vramAfter: await vramFree(), keys: Object.keys(out ?? {}), output: files[0], bytes: mp4.length };
    console.log(` ${seconds.toFixed(0)}s`, JSON.stringify(row));
    report.push(row);
  } catch (err) {
    console.log(" FAILED", err instanceof Error ? err.message : err, (err as { details?: unknown }).details ?? "");
    report.push({ name: c.name, error: String(err), details: (err as { details?: unknown }).details });
  }
}
writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
