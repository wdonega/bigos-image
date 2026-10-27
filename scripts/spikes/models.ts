// Model comparison spike (2026-10-26): the general-purpose image and video models installed in
// ComfyUI (from ../comfyui-workflows) on the app's four use cases: image with/without references,
// video with/without references. Also image models at 4 MP (the app's "Grande").
// Usage: node --env-file=.env scripts/spikes/models.ts [name-filter] [--list]
// Writes outputs and report.jsonl to storage/spikes/models/; an existing output is skipped (resume).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ComfyClient, type HistoryEntry, type ImageRef } from "../../src/lib/comfy/client.ts";
import { runPrompt } from "../../src/lib/comfy/run.ts";
import { getConfig } from "../../src/lib/config.ts";
import { buildPrompt } from "../../src/lib/prompt.ts";
import { buildVideoPrompt, videoFrames } from "../../src/lib/video.ts";
import { buildEdit, buildT2I, buildVideo } from "../../src/lib/workflow/build.ts";
import { type ApiGraph, findNodeId } from "../../src/lib/workflow/graph.ts";

const config = getConfig();
const WF = path.resolve("..", "comfyui-workflows", "workflows");
const outDir = path.resolve(config.storageDir, "spikes", "models");
mkdirSync(outDir, { recursive: true });
const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-models-${Date.now()}`, timeoutMs: 120_000 });

const load = (file: string): ApiGraph => JSON.parse(readFileSync(file, "utf8")) as ApiGraph;
const app = (name: string) => load(path.join("workflows", "api", `${name}.json`));
const repo = (folder: string) => load(path.join(WF, folder, "workflow.api.json"));
const fixedSize = (g: ApiGraph, id: string, w: number, h: number) => Object.assign(g[id].inputs, { width: w, height: h });

// ---------- prompts ----------

type ImageCase = { id: string; user: string; prompt: string; transparent?: boolean };
const T2I: ImageCase[] = [
  {
    id: "I1",
    user: "Senhora vendendo frutas numa feira de rua em Salvador, fim de tarde, foto realista",
    prompt:
      "Realistic photo of an elderly woman selling tropical fruits at a street market in Salvador, Bahia, late afternoon golden light, colorful fruit stalls, colonial houses in the background, natural skin texture.",
  },
  {
    id: "I2",
    user: "Cartaz de festa junina escrito 'ARRAIÁ DO BIGOS 2026', bandeirinhas coloridas, ilustração",
    prompt:
      'Illustrated poster for a Brazilian festa junina with the title "ARRAIÁ DO BIGOS 2026" in big bold letters, colorful bunting flags, a bonfire, corn and a starry night sky, flat vector illustration.',
  },
  {
    id: "I3",
    user: "Adesivo de um gato astronauta fofo, estilo 3D (Fundo transparente ligado)",
    prompt: "A cute astronaut cat sticker, 3D cartoon style, white outline, full body",
    transparent: true,
  },
];

type EditCase = { id: string; user: string; prompt: string; refs: string[] };
const EDIT: EditCase[] = [
  { id: "E1", user: "Troque o fundo por uma praia ao pôr do sol", prompt: "Replace the background with a beach at sunset. Keep the woman, her face, hair, clothes and pose unchanged.", refs: ["A"] },
  {
    id: "E2",
    user: "A mulher da Imagem 1 vestindo a jaqueta da Imagem 2",
    prompt: "The woman from <image1> wearing the denim jacket from <image2>. Keep her face, hair and pose from <image1>. Realistic photo.",
    refs: ["A", "B"],
  },
  {
    id: "E3",
    user: "A mulher da Imagem 1 passeando com o cachorro da Imagem 2 no parque da Imagem 3",
    prompt: "The woman from <image1> walking the dog from <image2> on a leash in the park from <image3>. Full body, realistic photo.",
    refs: ["A", "C", "D"],
  },
];

const REFS: { id: string; prompt: string }[] = [
  { id: "A", prompt: "Photo portrait of a fictional Brazilian woman in her 30s, curly dark hair, warm smile, white t-shirt, plain light gray studio background, upper body, soft natural light, photorealistic." },
  { id: "B", prompt: "Product photo of a classic blue denim jacket on a plain white background, front view, no person, studio lighting." },
  { id: "C", prompt: "Photo of a golden retriever sitting on short grass, looking at the camera, full body, sharp focus, natural daylight." },
  { id: "D", prompt: "Photo of a sunny city park with a paved path, green trees, wooden benches and a small lake, wide shot, no people." },
];

type VideoCase = { id: string; user: string; description: string; plain: string; sound: string; refs: string[] };
const VIDEO: VideoCase[] = [
  {
    id: "V1",
    user: "Cachorro correndo na praia ao pôr do sol, câmera acompanhando",
    description: "Live-action, cinematic. A dog runs along a beach at sunset, splashing through shallow waves, the camera tracking alongside at dog height. Warm golden light, sea spray.",
    plain: "",
    sound: "waves breaking, paws splashing in the water, a happy bark, light wind",
    refs: [],
  },
  {
    id: "V2",
    user: "Vendedor de rua grita para a câmera: 'Olha o picolé, fresquinho!'",
    description: 'Live-action. A cheerful street vendor with a popsicle cart on a sunny Brazilian beach promenade looks at the camera and shouts in Brazilian Portuguese: "Olha o picolé, fresquinho!" People walk by in the background.',
    plain: "",
    sound: "the vendor's voice, distant crowd chatter, waves, a cart bell ringing",
    refs: [],
  },
  {
    id: "V3",
    user: "Desenho animado de um foguete decolando de um quintal, crianças comemorando",
    description: "2D cartoon animation. A small homemade red rocket lifts off from a backyard with smoke and sparks while three children jump and cheer, the camera tilts up following the rocket into the blue sky.",
    plain: "",
    sound: "rocket whoosh, children cheering and clapping, birds",
    refs: [],
  },
  {
    id: "VR1",
    user: "A mulher da Imagem 1 caminhando numa rua de Lisboa, sorri e diz 'Bom dia!'",
    description: 'Live-action. <Subject 1> walks along a sunny cobblestone street in Lisbon with a yellow tram passing behind, then stops, smiles at the camera and says in Portuguese: "Bom dia!"',
    plain: 'Live-action. The woman walks along a sunny cobblestone street in Lisbon with a yellow tram passing behind, then stops, smiles at the camera and says in Portuguese: "Bom dia!"',
    sound: "footsteps on cobblestones, a tram bell, her voice, city ambience",
    refs: ["A"],
  },
  {
    id: "VR2",
    user: "O cachorro da Imagem 1 pulando para pegar um frisbee no parque",
    description: "Live-action, slow motion. <Subject 1> runs across a park lawn and leaps to catch a red frisbee in mid-air, then lands and trots back proudly.",
    plain: "Live-action, slow motion. The dog runs across a park lawn and leaps to catch a red frisbee in mid-air, then lands and trots back proudly.",
    sound: "paws on grass, a frisbee whoosh, a happy bark, birds",
    refs: ["C"],
  },
  {
    id: "VR3",
    user: "A mulher da Imagem 1 brincando com o cachorro da Imagem 2 no jardim",
    description: "Live-action. <Subject 1> kneels on the lawn of a sunny garden and plays with <Subject 2>, who jumps around her and licks her face while she laughs.",
    plain: "",
    sound: "her laughter, the dog panting and barking, birds, leaves rustling",
    refs: ["A", "C"],
  },
];

// ---------- image models ----------

const SEED = 20261026;
type Built = { graph: ApiGraph; save: string; prompt: string };
const uploaded = new Map<string, string>();
async function refFile(id: string): Promise<string> {
  if (!uploaded.has(id)) uploaded.set(id, await client.uploadImage(readFileSync(path.join(outDir, `ref-${id}.png`)), `bigos-models-ref-${id}.png`));
  return uploaded.get(id) as string;
}

function qwenTurbo(prompt: string, w: number, h: number, seed: number): ApiGraph {
  const g = repo("37-qwen-image-21-turbo");
  Object.assign(g["459:452"].inputs, { prompt, negative_prompt: "" });
  fixedSize(g, "459:456", w, h);
  g["459:488"].inputs.noise_seed = seed;
  return g;
}

const T2I_MODELS: Record<string, (prompt: string, w: number, h: number, seed: number) => Built> = {
  "qwen21-app": (prompt, w, h, seed) => ({
    graph: buildT2I(app("t2i_api"), { prompt, width: w, height: h, seed, steps: config.steps.normal }),
    save: "461",
    prompt,
  }),
  "qwen21-turbo": (prompt, w, h, seed) => ({ graph: qwenTurbo(prompt, w, h, seed), save: "461", prompt }),
  "qwen21-viggle": (prompt, w, h, seed) => {
    const g = repo("qwen-image-21-viggle-t2i");
    g["4"].inputs.prompt = prompt;
    for (const id of ["5", "15"]) fixedSize(g, id, w, h);
    g["6"].inputs.seed = seed;
    return { graph: g, save: "8", prompt };
  },
  "krea2-turbo": (prompt, w, h, seed) => {
    const g = repo("38-krea2-turbo");
    g["30:19"].inputs.value = prompt;
    fixedSize(g, "30:5", w, h);
    g["30:3"].inputs.seed = seed;
    return { graph: g, save: "29", prompt };
  },
  "flux3-klein": (prompt, w, h, seed) => {
    const g = repo("39-flux3-klein");
    g["18:17"].inputs.value = prompt;
    fixedSize(g, "18:6", w, h);
    g["18:7"].inputs.seed = seed;
    return { graph: g, save: "9", prompt };
  },
  "moss-image": (prompt, w, h, seed) => {
    const g = repo("40-moss-image");
    g["18:17"].inputs.value = prompt;
    fixedSize(g, "18:6", w, h);
    g["18:7"].inputs.seed = seed;
    return { graph: g, save: "9", prompt };
  },
};

const EDIT_MODELS: Record<string, (c: EditCase, seed: number) => Promise<Built>> = {
  "qwen21-app": async (c, seed) => ({
    graph: buildEdit(app("edit_api"), {
      prompt: c.prompt,
      images: await Promise.all(c.refs.map(refFile)),
      size: { width: 1024, height: 1024 },
      seed,
      steps: config.steps.normal,
    }),
    save: "461",
    prompt: c.prompt,
  }),
  "qwen21-viggle": async (c, seed) => {
    const g = repo("qwen-image-21-viggle-edit");
    g["4"].inputs.prompt = c.prompt;
    Object.assign(g["20"].inputs, { aspect_ratio: "1:1 (Square)", megapixels: 1 });
    g["30"].inputs.value = c.refs.length;
    const loaders = ["10", "22", "23"];
    for (const [i, ref] of c.refs.entries()) g[loaders[i]].inputs.image = await refFile(ref);
    for (const id of loaders.slice(c.refs.length)) g[id].inputs.image = await refFile("A"); // unused slot, must exist
    g["6"].inputs.seed = seed;
    return { graph: g, save: "8", prompt: c.prompt };
  },
  // Experimental: the turbo model with references on the same encoder (no edit template for it).
  "qwen21-turbo": async (c, seed) => {
    const g = qwenTurbo(c.prompt, 1024, 1024, seed);
    Object.assign(g["459:452"].inputs, { resolution: 0, vae: ["459:454", 0] });
    for (const [i, ref] of c.refs.entries()) {
      g[`ref${i + 1}`] = { class_type: "LoadImage", inputs: { image: await refFile(ref) } };
      g["459:452"].inputs[`images.image_${i + 1}`] = [`ref${i + 1}`, 0];
    }
    return { graph: g, save: "461", prompt: c.prompt };
  },
  // Experimental: Flux 3 Klein with ReferenceLatent (the Flux 2 Klein editing recipe); upsampler off.
  "flux3-klein": async (c, seed) => {
    const g = repo("39-flux3-klein");
    g["18:17"].inputs.value = c.prompt;
    g["18:16"].inputs.switch = false;
    fixedSize(g, "18:6", 1024, 1024);
    g["18:7"].inputs.seed = seed;
    let pos: [string, number] = ["18:4", 0];
    let neg: [string, number] = ["18:5", 0];
    for (const [i, ref] of c.refs.entries()) {
      const n = i + 1;
      g[`ref${n}`] = { class_type: "LoadImage", inputs: { image: await refFile(ref) } };
      g[`scale${n}`] = { class_type: "ImageScaleToTotalPixels", inputs: { upscale_method: "lanczos", megapixels: 1, resolution_steps: 16, image: [`ref${n}`, 0] } };
      g[`enc${n}`] = { class_type: "VAEEncode", inputs: { pixels: [`scale${n}`, 0], vae: ["18:3", 0] } };
      g[`rp${n}`] = { class_type: "ReferenceLatent", inputs: { conditioning: pos, latent: [`enc${n}`, 0] } };
      g[`rn${n}`] = { class_type: "ReferenceLatent", inputs: { conditioning: neg, latent: [`enc${n}`, 0] } };
      pos = [`rp${n}`, 0];
      neg = [`rn${n}`, 0];
    }
    Object.assign(g["18:7"].inputs, { positive: pos, negative: neg });
    return { graph: g, save: "9", prompt: c.prompt };
  },
};

// ---------- video models ----------

const VW = 1280;
const VH = 720;
const plainOf = (c: VideoCase) => c.plain || c.description;

const VIDEO_MODELS: Record<string, { maxRefs: number; textToVideo: boolean; build: (c: VideoCase, seed: number) => Promise<Built> }> = {
  "h3-taomate-app": {
    maxRefs: 9,
    textToVideo: true,
    build: async (c, seed) => {
      const prompt = buildVideoPrompt({ description: c.description, soundscape: c.sound, music: "", references: c.refs.length });
      const images = await Promise.all(c.refs.map(refFile));
      const graph = buildVideo(app(images.length ? "video_ref2va_api" : "video_fl2va_api"), { prompt, width: VW, height: VH, frames: videoFrames(5), seed, images });
      return { graph, save: "403", prompt };
    },
  },
  "h3-turbo-v4": {
    maxRefs: 9,
    textToVideo: false, // the tested workflow is Ref2VA only
    build: async (c, seed) => {
      const prompt = buildVideoPrompt({ description: c.description, soundscape: c.sound, music: "", references: c.refs.length });
      const images = await Promise.all(c.refs.map(refFile));
      const graph = buildVideo(repo("02-h3-turbo-v4"), { prompt, width: VW, height: VH, frames: videoFrames(5), seed, images });
      return { graph, save: findNodeId(graph, "@save"), prompt };
    },
  },
  ltx23: {
    maxRefs: 1,
    textToVideo: true,
    build: async (c, seed) => {
      const g = repo("04-ltx23-i2v");
      const prompt = `${plainOf(c)} Sounds: ${c.sound}.`;
      g["320:319"].inputs.value = prompt;
      g["320:312"].inputs.value = VW;
      g["320:299"].inputs.value = VH;
      g["320:301"].inputs.value = 5;
      g["320:302"].inputs.value = c.refs.length === 0; // "Switch to Text to Video?"
      g["269"].inputs.image = await refFile(c.refs[0] ?? "A"); // ignored in text-to-video mode
      g["320:276"].inputs.noise_seed = seed;
      g["320:277"].inputs.noise_seed = seed;
      return { graph: g, save: "75", prompt };
    },
  },
  "wan22-5b": {
    maxRefs: 1,
    textToVideo: true,
    build: async (c, seed) => {
      const g = repo("06-wan22-5b-ti2v");
      const prompt = plainOf(c);
      g["6"].inputs.text = prompt;
      g["3"].inputs.seed = seed;
      if (c.refs.length) {
        g.start = { class_type: "LoadImage", inputs: { image: await refFile(c.refs[0]) } };
        g["55"].inputs.start_image = ["start", 0];
      }
      return { graph: g, save: "58", prompt };
    },
  },
};

// ---------- runs ----------

type Run = { name: string; group: string; caseId: string; model: string; user: string; refs: string[]; size: string; build: () => Promise<Built> };
const runs: Run[] = [];
for (const r of REFS) {
  runs.push({ name: `ref-${r.id}`, group: "ref", caseId: r.id, model: "qwen21-turbo", user: r.prompt, refs: [], size: "1024x1024", build: async () => ({ graph: qwenTurbo(r.prompt, 1024, 1024, SEED), save: "461", prompt: r.prompt }) });
}
for (const model of Object.keys(T2I_MODELS)) {
  for (const [i, c] of T2I.entries()) {
    const prompt = buildPrompt(c.prompt, !!c.transparent);
    runs.push({ name: `t2i-${c.id}-${model}`, group: "t2i", caseId: c.id, model, user: c.user, refs: [], size: "1024x1024", build: async () => T2I_MODELS[model](prompt, 1024, 1024, SEED + i) });
  }
}
for (const model of Object.keys(EDIT_MODELS)) {
  for (const [i, c] of EDIT.entries()) {
    runs.push({ name: `edit-${c.id}-${model}`, group: "edit", caseId: c.id, model, user: c.user, refs: c.refs, size: "1024x1024", build: () => EDIT_MODELS[model](c, SEED + 10 + i) });
  }
}
for (const model of Object.keys(T2I_MODELS)) {
  runs.push({ name: `4mp-I1-${model}`, group: "4mp", caseId: "I1", model, user: T2I[0].user, refs: [], size: "2048x2048", build: async () => T2I_MODELS[model](T2I[0].prompt, 2048, 2048, SEED) });
}
for (const [model, m] of Object.entries(VIDEO_MODELS)) {
  for (const [i, c] of VIDEO.entries()) {
    if (c.refs.length > m.maxRefs || (c.refs.length === 0 && !m.textToVideo)) continue;
    const size = model === "wan22-5b" ? "1280x704" : `${VW}x${VH}`;
    runs.push({ name: `video-${c.id}-${model}`, group: c.refs.length ? "video-ref" : "video", caseId: c.id, model, user: c.user, refs: c.refs, size, build: () => m.build(c, SEED + 20 + i) });
  }
}

// ---------- runner ----------

// Filter: comma-separated name substrings. --force runs again even when the output exists.
const filters = process.argv.slice(2).find((a) => !a.startsWith("--"))?.split(",") ?? [];
const selected = filters.length ? runs.filter((r) => filters.some((f) => r.name.includes(f))) : runs;
const force = process.argv.includes("--force");
if (process.argv.includes("--list")) {
  for (const r of selected) console.log(r.name);
  process.exit(0);
}
const reportFile = path.join(outDir, "report.jsonl");

function executionSeconds(entry: HistoryEntry): number | null {
  const ts = (type: string) => entry.status?.messages?.find(([t]) => t === type)?.[1]?.timestamp as number | undefined;
  const start = ts("execution_start");
  const end = ts("execution_success");
  return start && end ? (end - start) / 1000 : null;
}

/** Text shown by PreviewAny nodes: the prompt after the template's upsampler (Krea, Flux, MOSS). */
function previewText(entry: HistoryEntry): string | undefined {
  for (const out of Object.values(entry.outputs ?? {})) {
    const text = (out as { text?: string[] }).text?.[0];
    if (text) return text;
  }
  return undefined;
}

/** Unloads every model and frees cached RAM: switching models kept stacking them in host RAM until ComfyUI froze. */
async function freeMemory(): Promise<void> {
  const res = await fetch(`${config.comfyUrl}/free`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  });
  const stats = (await client.systemStats()) as { system?: { ram_free?: number } };
  console.log(`free → ${res.status}, RAM free ${((stats.system?.ram_free ?? 0) / 1e9).toFixed(1)} GB`);
}

console.log(`${selected.length} runs`);
let lastModel = "";
for (const r of selected) {
  const ext = r.group.startsWith("video") ? "mp4" : "png";
  const file = `${r.name}.${ext}`;
  if (!force && existsSync(path.join(outDir, file))) {
    console.log(`skip ${r.name}`);
    continue;
  }
  if (r.model !== lastModel) await freeMemory();
  lastModel = r.model;
  const t0 = Date.now();
  process.stdout.write(`${r.name} `);
  let built: Built | undefined;
  try {
    built = await r.build();
    const { entry } = await runPrompt(client, built.graph, {
      timeoutMs: 60 * 60_000,
      outageMs: 5 * 60_000,
      onProgress: (p) => process.stdout.write(p.phase === "running" ? "." : "w"),
    });
    const wall = (Date.now() - t0) / 1000;
    const out = entry.outputs?.[built.save] as { images?: ImageRef[]; gifs?: ImageRef[] } | undefined;
    const ref = out?.gifs?.[0] ?? out?.images?.[0];
    if (!ref) throw new Error(`no output on node ${built.save}: ${JSON.stringify(entry.outputs)}`);
    const data = await client.view(ref);
    writeFileSync(path.join(outDir, file), data);
    const extra: Record<string, unknown> = {};
    if (ext === "png") {
      const meta = await sharp(data).metadata();
      Object.assign(extra, { width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha });
      if (meta.hasAlpha) {
        const alpha = await sharp(data).extractChannel("alpha").raw().toBuffer();
        extra.transparentShare = alpha.filter((v) => v < 16).length / alpha.length;
      }
    }
    const row = { ...r, build: undefined, file, ok: true, startedAt: t0, endedAt: Date.now(), wallSeconds: wall, execSeconds: executionSeconds(entry), bytes: data.length, prompt: built.prompt, upsampled: previewText(entry), ...extra };
    console.log(` ${wall.toFixed(0)}s`);
    appendFileSync(reportFile, `${JSON.stringify(row)}\n`);
  } catch (err) {
    const wall = (Date.now() - t0) / 1000;
    const details = (err as { details?: unknown }).details;
    console.log(` FAILED ${wall.toFixed(0)}s`, err instanceof Error ? err.message : err, JSON.stringify(details ?? "").slice(0, 600));
    appendFileSync(reportFile, `${JSON.stringify({ ...r, build: undefined, file, ok: false, startedAt: t0, endedAt: Date.now(), wallSeconds: wall, prompt: built?.prompt, error: err instanceof Error ? err.message : String(err), details })}\n`);
  }
}
