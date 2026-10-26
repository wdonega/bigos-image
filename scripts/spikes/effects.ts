// Video effects spikes (spec §14, decision 31): the four fx_* graphs end to end — time, VRAM,
// output key of SaveVideo, and whether a video upload goes through /upload/image.
// Usage: node --env-file=.env scripts/spikes/effects.ts [name-filter] [seconds]   (seconds: 5 = template lengths; 10 uses boxer10.mp4)
// Inputs: storage/spikes/effects/inputs/ (boxer.mp4, 5.2 s; face.png; owl.png).
// Writes MP4s and report.json to storage/spikes/effects/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComfyClient } from "../../src/lib/comfy/client.ts";
import { runPrompt } from "../../src/lib/comfy/run.ts";
import { getConfig } from "../../src/lib/config.ts";
import { type ApiGraph, findNodeId, setInputs } from "../../src/lib/workflow/graph.ts";

type Case = { name: string; file: string; image?: string; inputs: Record<string, Record<string, unknown>> };

const config = getConfig();
const SECONDS = Number(process.argv[3] ?? 5);
const VIDEO = SECONDS > 5 ? "storage/spikes/effects/inputs/boxer10.mp4" : "storage/spikes/effects/inputs/boxer.mp4";
/** Wan Animate frames at the driving video's 24 fps, on its 4n+1 grid (81 = the template's 3.4 s). */
const ANIMATE_FRAMES = SECONDS > 5 ? Math.round((SECONDS * 24 - 1) / 4) * 4 + 1 : 81;
const SCENE =
  "a vintage boxing gym with a boxing ring in the center, ropes and corner pads, exposed brick walls with red and green neon signs, tall windows, hanging industrial lamps, warm hazy light";

const cases: Case[] = [
  {
    name: "clean-plate",
    file: "fx_clean_plate_api.json",
    image: "storage/spikes/effects/inputs/face.png",
    inputs: {
      "@prompt": { text: `An empty boxing ring in ${SCENE}. No people, no person anywhere in the frame.` },
      "@negative": { text: "person, people, man, boxer, athlete, body, face, hands, gloves" },
      "@seed": { noise_seed: 42 },
      "@trim": { duration: SECONDS },
    },
  },
  {
    name: "face-swap",
    file: "fx_face_swap_api.json",
    image: "storage/spikes/effects/inputs/face.png",
    inputs: {
      "@prompt": {
        value: `An elderly woman with grey hair and a calm face, shirtless boxer body with red boxing gloves and green shorts, standing in a boxing ring in ${SCENE}.`,
      },
      "@seed": { noise_seed: 42 },
      "@duration": { value: SECONDS },
    },
  },
  {
    name: "animate",
    file: "fx_animate_api.json",
    image: "storage/spikes/effects/inputs/owl.png",
    inputs: {
      "@prompt": { value: "A cartoon owl standing and swaying, raising its wings like a boxer getting ready to fight." },
      "@character": {
        value: "Character appearance description: a cute cartoon owl with orange feathers, big round eyes, a purple wizard hat and a green book.",
      },
      "@seed": { noise_seed: 42 },
      "@trim": { duration: SECONDS },
      "@size": { "resize_type.width": 832, "resize_type.height": 480 },
      "@windows": { switch: SECONDS > 5 },
      "@frames": { length: ANIMATE_FRAMES },
    },
  },
  {
    name: "character-swap",
    file: "fx_character_swap_api.json",
    image: "storage/spikes/effects/inputs/face.png",
    inputs: { "@subject": { text: "man" }, "@seed": { seed: 42 }, "@prepare": { duration_seconds: SECONDS } },
  },
];

const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;
const outDir = path.resolve(config.storageDir, "spikes", "effects");
mkdirSync(outDir, { recursive: true });
const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-spike-${Date.now()}`, timeoutMs: 120_000 });

async function vramFree(): Promise<number | null> {
  const stats = (await client.systemStats()) as { devices?: { vram_free?: number }[] };
  return stats.devices?.[0]?.vram_free ?? null;
}

const hasTitle = (graph: ApiGraph, title: string) => Object.values(graph).some((n) => n._meta?.title === title);

const videoName = await client.uploadImage(readFileSync(VIDEO), "bigos-spike-fx.mp4");
console.log("uploaded video as", videoName);

const report: Record<string, unknown>[] = [];
console.log(`${SECONDS} s from ${VIDEO}; animate frames ${ANIMATE_FRAMES}`);
for (const c of selected) {
  const graph = JSON.parse(readFileSync(path.join("workflows", "api", c.file), "utf8")) as ApiGraph;
  const videoIn = graph[findNodeId(graph, "@video_in")];
  videoIn.inputs["file" in videoIn.inputs ? "file" : "video"] = videoName;
  if (c.image) {
    const name = await client.uploadImage(readFileSync(c.image), `bigos-spike-fx-${path.basename(c.image)}`);
    for (const title of ["@image_1", "@first_frame"]) if (hasTitle(graph, title)) setInputs(graph, title, { image: name });
  }
  for (const [title, values] of Object.entries(c.inputs)) setInputs(graph, title, values);
  const vramBefore = await vramFree();
  const t0 = Date.now();
  process.stdout.write(`${c.name} `);
  try {
    const { entry } = await runPrompt(client, graph, {
      timeoutMs: 60 * 60_000,
      outageMs: 120_000,
      onProgress: (p) => process.stdout.write(p.phase === "running" ? "." : "w"),
    });
    const seconds = (Date.now() - t0) / 1000;
    const out = (entry.outputs ?? {})[findNodeId(graph, "@save")] as Record<string, unknown>;
    const files = (out?.gifs ?? out?.videos ?? out?.images) as { filename: string; subfolder: string; type: string }[];
    const mp4 = await client.view(files[0]);
    writeFileSync(path.join(outDir, `${c.name}-${SECONDS}s.mp4`), mp4);
    const row = { name: c.name, seconds, vramBefore, vramAfter: await vramFree(), keys: Object.keys(out ?? {}), output: files[0], bytes: mp4.length };
    console.log(` ${seconds.toFixed(0)}s`, JSON.stringify(row));
    report.push(row);
  } catch (err) {
    console.log(" FAILED", err instanceof Error ? err.message : err, JSON.stringify((err as { details?: unknown }).details ?? "").slice(0, 2000));
    report.push({ name: c.name, error: String(err), details: (err as { details?: unknown }).details });
  }
}
writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
