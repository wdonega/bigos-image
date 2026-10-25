// Acceptance checks from spec §13 against the running app and the real ComfyUI.
// Usage: pnpm acceptance [base-url] [--effects]   (default http://localhost:3000; ~4 min of GPU time)
// Needs the M1 spike images (node --env-file=.env scripts/spikes/m1.ts) for the Edit checks, and the
// effects inputs in storage/spikes/effects/inputs/ (scripts/spikes/effects.ts) for the video effects.
// --effects also runs one effect on the GPU (Remove people, ~5 min); the other effect checks are
// validation only.
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { readVideoInfo } from "../src/lib/mp4.ts";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const withEffects = args.includes("--effects");
const fxInputs = path.resolve("storage/spikes/effects/inputs");
const m1 = path.resolve("storage/spikes/m1");
const results: { name: string; ok: boolean; detail: string }[] = [];

type View = { status: string; url?: string; warnings?: string[]; ahead?: number; error?: unknown };

async function post(url: string, body: unknown) {
  const res = await fetch(`${base}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function upload(png: Buffer) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(png)]), "image.png");
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  return (await res.json()) as { id: string; sentWidth: number; sentHeight: number; warnings: { code: string }[] };
}

async function wait(jobId: string): Promise<View> {
  for (;;) {
    const view = (await (await fetch(`${base}/api/jobs/${jobId}`)).json()) as View;
    if (["done", "failed", "cancelled"].includes(view.status)) return view;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function run(body: Record<string, unknown>) {
  const created = await post("/api/jobs", { screen: "generate", size: { ratio: "1:1", megapixels: 1 }, ...body });
  if (created.status !== 202) throw new Error(JSON.stringify(created.body));
  const view = await wait(created.body.job_id);
  if (view.status !== "done") throw new Error(`${view.status} ${JSON.stringify(view.error)}`);
  const png = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
  const meta = await sharp(png).metadata();
  let clear = 0;
  if (meta.hasAlpha) {
    const alpha = await sharp(png).extractChannel(3).raw().toBuffer();
    for (const a of alpha) if (a < 16) clear++;
    clear /= alpha.length;
  }
  return { view, png, meta, clear };
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
  const r = results.at(-1)!;
  console.log(`${r.ok ? "✓" : "✗"} ${name} — ${r.detail}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await check("Generate with defaults → opaque 1024 × 1024 PNG", async () => {
  const { meta } = await run({ prompt: "A lighthouse on a rocky coast at sunset" });
  assert(meta.format === "png" && meta.width === 1024 && meta.height === 1024, `${meta.format} ${meta.width}x${meta.height}`);
  assert(!meta.hasAlpha, "an opaque PNG should have no alpha channel");
  return "png 1024x1024, no alpha";
});

await check("Manual 1280 × 736 generates at that size", async () => {
  const { meta } = await run({ prompt: "A red car", size: { ratio: "manual", width: 1280, height: 736 } });
  assert(meta.width === 1280 && meta.height === 736, `${meta.width}x${meta.height}`);
  return "1280x736";
});

await check("Invalid Manual size is rejected with reasons", async () => {
  const r = await post("/api/jobs", { screen: "generate", prompt: "x", size: { ratio: "manual", width: 1000, height: 300 } });
  assert(r.status === 400 && r.body.error.code === "invalid_size", JSON.stringify(r.body));
  return r.body.error.details.map((d: { code: string }) => d.code).join(", ");
});

await check("References: the 11th image is rejected", async () => {
  const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#888" } }).png().toBuffer();
  const id = (await upload(png)).id;
  const r = await post("/api/jobs", { screen: "generate", prompt: "x", images: Array(11).fill(id), size: { ratio: "1:1", megapixels: 1 } });
  assert(r.status === 400 && r.body.error.code === "too_many_images", JSON.stringify(r.body));
  return r.body.error.details.map((d: { code: string }) => d.code).join(", ");
});

await check("Edit, Original → output matches the sent size (≤ 31 px off)", async () => {
  const png = await sharp(path.join(m1, "size-1x1-1mp.png")).resize(1000, 750, { fit: "cover" }).jpeg().toBuffer();
  const u = await upload(png);
  const { meta } = await run({ screen: "edit", prompt: "Troque a parede amarela por tijolos", images: [u.id], size: { ratio: "original" } });
  assert(meta.width === u.sentWidth && meta.height === u.sentHeight, `${meta.width}x${meta.height} vs ${u.sentWidth}x${u.sentHeight}`);
  return `1000x750 → ${meta.width}x${meta.height}`;
});

await check("Edit, image above the limit → reduced with a warning", async () => {
  const png = await sharp(path.join(m1, "lang-2-en.png")).resize(3000, 2000, { fit: "cover" }).jpeg().toBuffer();
  const u = await upload(png);
  assert(u.sentWidth * u.sentHeight <= 4_194_304 && u.warnings.length === 1, JSON.stringify(u));
  return `3000x2000 → ${u.sentWidth}x${u.sentHeight}: ${JSON.stringify(u.warnings)}`;
});

await check("Transparent background (Generate) → alpha in ≥ 5% of pixels", async () => {
  const { clear } = await run({ prompt: "uma maçã vermelha", transparent_background: true });
  assert(clear >= 0.05, `alpha<16 in ${(clear * 100).toFixed(1)}%`);
  return `alpha<16 in ${(clear * 100).toFixed(1)}%`;
});

await check("Transparent background (Edit, subject on plain background) → alpha in ≥ 5%", async () => {
  const png = await sharp(path.join(m1, "lang-3-en.png")).png().toBuffer();
  const u = await upload(png);
  const { clear } = await run({ screen: "edit", prompt: "Coloque um chapéu de mago na coruja", images: [u.id], size: { ratio: "original" }, transparent_background: true });
  assert(clear >= 0.05, `alpha<16 in ${(clear * 100).toFixed(1)}%`);
  return `alpha<16 in ${(clear * 100).toFixed(1)}%`;
});

await check("Two identical runs produce different images", async () => {
  const a = await run({ prompt: "A small wooden boat on a lake" });
  const b = await run({ prompt: "A small wooden boat on a lake" });
  const ra = await sharp(a.png).raw().toBuffer();
  const rb = await sharp(b.png).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < ra.length; i++) diff += Math.abs(ra[i] - rb[i]);
  const mean = diff / ra.length;
  assert(mean > 5, `mean difference ${mean.toFixed(1)}`);
  return `mean difference per channel ${mean.toFixed(1)}`;
});

await check("With the GPU busy, the user sees the waiting state", async () => {
  const body = { screen: "generate", prompt: "A cat", size: { ratio: "1:1", megapixels: 1 } };
  const first = await post("/api/jobs", body);
  const second = await post("/api/jobs", body);
  await new Promise((r) => setTimeout(r, 1500));
  const view = (await (await fetch(`${base}/api/jobs/${second.body.job_id}`)).json()) as View;
  await wait(first.body.job_id);
  await fetch(`${base}/api/jobs/${second.body.job_id}`, { method: "DELETE" });
  assert(view.status === "queued" && (view.ahead ?? 0) >= 1, JSON.stringify(view));
  return `2nd request: ${JSON.stringify(view)}`;
});

// Video effects (spec §13 and §14, decision 31).
async function uploadFile(file: string, extra?: [string, string]) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(readFileSync(file))]), path.basename(file));
  if (extra) form.append(extra[0], new Blob([new Uint8Array(readFileSync(extra[1]))]), path.basename(extra[1]));
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

let videoId = "";
let faceId = "";
await check("Effects: an MP4 upload reports its length and size; longer than the limit → trim warning", async () => {
  const up = await uploadFile(path.join(fxInputs, "boxer.mp4"), ["frame", path.join(fxInputs, "boxer-frame.png")]);
  assert(up.status === 201, JSON.stringify(up.body));
  const b = up.body as { id: string; seconds: number; width: number; height: number; hasAudio: boolean; hasFrame: boolean; warnings: { code: string }[] };
  assert(b.seconds > 5 && b.width === 1280 && b.hasAudio && b.hasFrame, JSON.stringify(b));
  assert(b.warnings.some((w) => w.code === "video_trimmed"), JSON.stringify(b.warnings));
  videoId = b.id;
  faceId = ((await uploadFile(path.join(fxInputs, "face.png"))).body as { id: string }).id;
  return `${b.seconds} s, ${b.width}×${b.height}, warning video_trimmed`;
});

await check("Effects: a file that is not a video is rejected (invalid_video)", async () => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3, 4])]), "fake.mp4");
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  const body = (await res.json()) as { error?: { code: string } };
  assert(res.status === 400 && body.error?.code === "invalid_video", JSON.stringify(body));
  return "400 invalid_video";
});

await check("Effects: photo effects need the photo and the consent", async () => {
  const noPhoto = await post("/api/jobs", { screen: "effects", effect: "face_swap", video: videoId, consent: true });
  const noConsent = await post("/api/jobs", { screen: "effects", effect: "character_swap", video: videoId, images: [faceId] });
  const codes = [noPhoto, noConsent].map((r) => `${r.status} ${r.body.error?.details?.[0]?.code}`);
  assert(codes[0] === "400 effect_needs_photo" && codes[1] === "400 consent_required", codes.join(", "));
  return codes.join(", ");
});

if (withEffects) {
  await check("Effects: Remove people returns an H.264 MP4 with sound, at most the limit long", async () => {
    const created = await post("/api/jobs", { screen: "effects", effect: "remove_people", video: videoId, prompt: "o boxeador" });
    assert(created.status === 202, JSON.stringify(created.body));
    const view = await wait(created.body.job_id);
    assert(view.status === "done", `${view.status} ${JSON.stringify(view.error)}`);
    const mp4 = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
    const info = readVideoInfo(mp4);
    assert(info && info.hasAudio && mp4.includes("avc1") && info.seconds <= 5.1, JSON.stringify(info));
    return `${info.seconds.toFixed(1)} s, ${info.width}×${info.height}, audio`;
  });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
