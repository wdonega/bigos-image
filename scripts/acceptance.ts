// Acceptance checks from spec §13 against the running app and the real ComfyUI.
// Usage: pnpm acceptance [base-url]   (default http://localhost:3000; takes ~4 min of GPU time)
// Needs the M1 spike images (node --env-file=.env scripts/spikes/m1.ts) for the Editar checks.
import path from "node:path";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3000";
const m1 = path.resolve("storage/spikes/m1");
const results: { name: string; ok: boolean; detail: string }[] = [];

type View = { status: string; imageUrl?: string; warnings?: string[]; ahead?: number; error?: unknown };

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
  return (await res.json()) as { id: string; sentWidth: number; sentHeight: number; warnings: string[] };
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
  const png = Buffer.from(await (await fetch(`${base}${view.imageUrl}`)).arrayBuffer());
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

await check("Gerar sem mexer em nada → PNG 1024 × 1024 opaco", async () => {
  const { meta } = await run({ prompt: "A lighthouse on a rocky coast at sunset" });
  assert(meta.format === "png" && meta.width === 1024 && meta.height === 1024, `${meta.format} ${meta.width}x${meta.height}`);
  assert(!meta.hasAlpha, "PNG opaco não deveria ter canal alfa");
  return "png 1024x1024, sem alfa";
});

await check("Manual 1280 × 736 gera com essas dimensões", async () => {
  const { meta } = await run({ prompt: "A red car", size: { ratio: "manual", width: 1280, height: 736 } });
  assert(meta.width === 1280 && meta.height === 736, `${meta.width}x${meta.height}`);
  return "1280x736";
});

await check("Manual fora da regra é rejeitado com motivo", async () => {
  const r = await post("/api/jobs", { screen: "generate", prompt: "x", size: { ratio: "manual", width: 1000, height: 300 } });
  assert(r.status === 400 && r.body.error.code === "invalid_size", JSON.stringify(r.body));
  return r.body.error.details.join(" / ");
});

await check("Referências: 11ª imagem é rejeitada", async () => {
  const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#888" } }).png().toBuffer();
  const id = (await upload(png)).id;
  const r = await post("/api/jobs", { screen: "generate", prompt: "x", images: Array(11).fill(id), size: { ratio: "1:1", megapixels: 1 } });
  assert(r.status === 400 && r.body.error.code === "too_many_images", JSON.stringify(r.body));
  return r.body.error.details.join(" ");
});

await check("Editar, Original → saída com as dimensões enviadas (≤ 31 px de diferença)", async () => {
  const png = await sharp(path.join(m1, "size-1x1-1mp.png")).resize(1000, 750, { fit: "cover" }).jpeg().toBuffer();
  const u = await upload(png);
  const { meta } = await run({ screen: "edit", prompt: "Troque a parede amarela por tijolos", images: [u.id], size: { ratio: "original" } });
  assert(meta.width === u.sentWidth && meta.height === u.sentHeight, `${meta.width}x${meta.height} vs ${u.sentWidth}x${u.sentHeight}`);
  return `1000x750 → ${meta.width}x${meta.height}`;
});

await check("Editar, imagem acima do limite → reduzida com aviso", async () => {
  const png = await sharp(path.join(m1, "lang-2-en.png")).resize(3000, 2000, { fit: "cover" }).jpeg().toBuffer();
  const u = await upload(png);
  assert(u.sentWidth * u.sentHeight <= 4_194_304 && u.warnings.length === 1, JSON.stringify(u));
  return `3000x2000 → ${u.sentWidth}x${u.sentHeight}: "${u.warnings[0]}"`;
});

await check("Fundo transparente (Gerar) → alfa em ≥ 5% dos pixels", async () => {
  const { clear } = await run({ prompt: "uma maçã vermelha", transparent_background: true });
  assert(clear >= 0.05, `alfa<16 em ${(clear * 100).toFixed(1)}%`);
  return `alfa<16 em ${(clear * 100).toFixed(1)}%`;
});

await check("Fundo transparente (Editar, objeto em fundo simples) → alfa em ≥ 5%", async () => {
  const png = await sharp(path.join(m1, "lang-3-en.png")).png().toBuffer();
  const u = await upload(png);
  const { clear } = await run({ screen: "edit", prompt: "Coloque um chapéu de mago na coruja", images: [u.id], size: { ratio: "original" }, transparent_background: true });
  assert(clear >= 0.05, `alfa<16 em ${(clear * 100).toFixed(1)}%`);
  return `alfa<16 em ${(clear * 100).toFixed(1)}%`;
});

await check("Duas execuções idênticas sem seed geram resultados diferentes", async () => {
  const a = await run({ prompt: "A small wooden boat on a lake" });
  const b = await run({ prompt: "A small wooden boat on a lake" });
  const ra = await sharp(a.png).raw().toBuffer();
  const rb = await sharp(b.png).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < ra.length; i++) diff += Math.abs(ra[i] - rb[i]);
  const mean = diff / ra.length;
  assert(mean > 5, `diferença média ${mean.toFixed(1)}`);
  return `diferença média por canal ${mean.toFixed(1)}`;
});

await check("Com a GPU ocupada, o usuário vê o estado de espera", async () => {
  const body = { screen: "generate", prompt: "A cat", size: { ratio: "1:1", megapixels: 1 } };
  const first = await post("/api/jobs", body);
  const second = await post("/api/jobs", body);
  await new Promise((r) => setTimeout(r, 1500));
  const view = (await (await fetch(`${base}/api/jobs/${second.body.job_id}`)).json()) as View;
  await wait(first.body.job_id);
  await fetch(`${base}/api/jobs/${second.body.job_id}`, { method: "DELETE" });
  assert(view.status === "queued" && (view.ahead ?? 0) >= 1, JSON.stringify(view));
  return `2º pedido: ${JSON.stringify(view)}`;
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
