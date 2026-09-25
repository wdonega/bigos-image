// End-to-end check through the app's HTTP API (needs `pnpm dev` or `pnpm start` running).
// Usage: pnpm smoke [base-url]   (default http://localhost:3000)
// Acceptance §13: Generate with no references and default settings → 1024 × 1024 PNG via t2i.
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3000";

const res = await fetch(`${base}/api/jobs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    screen: "generate",
    prompt: "A lighthouse on a rocky coast at sunset, photorealistic",
    size: { ratio: "1:1", megapixels: 1 },
  }),
});
const created = (await res.json()) as { job_id?: string; error?: unknown };
if (!res.ok || !created.job_id) {
  console.error("POST /api/jobs failed", res.status, created);
  process.exit(1);
}
console.log("job", created.job_id);

const started = Date.now();
let last = "";
for (;;) {
  const view = (await (await fetch(`${base}/api/jobs/${created.job_id}`)).json()) as {
    status: string;
    imageUrl?: string;
  };
  const line = JSON.stringify(view);
  if (line !== last) console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`, line);
  last = line;
  if (view.status === "done") {
    const png = Buffer.from(await (await fetch(`${base}${view.imageUrl}`)).arrayBuffer());
    const meta = await sharp(png).metadata();
    const ok = meta.format === "png" && meta.width === 1024 && meta.height === 1024;
    console.log(ok ? "OK" : "FAIL", `${meta.format} ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);
    process.exit(ok ? 0 : 1);
  }
  if (view.status === "failed" || view.status === "cancelled") process.exit(1);
  await new Promise((r) => setTimeout(r, 1000));
}
