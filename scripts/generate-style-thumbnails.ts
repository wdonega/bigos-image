// Generates the sample image of each style by restyling the app icon (docs/icons/icon_warm.png)
// through the app's Edit API. Needs `pnpm dev` or `pnpm start`, ComfyUI and the LLM (LLM_URL).
// Usage: pnpm styles:thumbs [base-url] [--force] [--only=id1,id2]   (outputs in public/styles/ are committed)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { STYLES } from "../src/lib/styles.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const SOURCE = "docs/icons/icon_warm.png";
// Goes through the real flow: the style is sent by id and the worker's final LLM pass puts it up
// front (spec §14, decision 24), so the samples show what users get.
const INSTRUCTION = "The cat painter from [Image 1] with beret, brush, palette and easel";
const OUT = "public/styles";
const SIDE = 256;

mkdirSync(OUT, { recursive: true });
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const todo = STYLES.filter((s) => (only ? only.includes(s.id) : force || !existsSync(`${OUT}/${s.id}.webp`)));
console.log(`${todo.length} of ${STYLES.length} styles to generate`);

const form = new FormData();
form.append("file", new Blob([readFileSync(SOURCE)], { type: "image/png" }), "icon_warm.png");
const uploadRes = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
const upload = (await uploadRes.json()) as { id?: string };
if (!uploadRes.ok || !upload.id) {
  console.error("POST /api/uploads failed", uploadRes.status, upload);
  process.exit(1);
}

for (const [i, style] of todo.entries()) {
  const started = Date.now();
  const res = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      screen: "edit",
      prompt: INSTRUCTION,
      images: [upload.id],
      style: style.id,
      size: { ratio: "1:1", megapixels: 1 },
    }),
  });
  const created = (await res.json()) as { job_id?: string };
  if (!res.ok || !created.job_id) {
    console.error(style.id, "POST /api/jobs failed", res.status, created);
    process.exit(1);
  }
  for (;;) {
    const view = (await (await fetch(`${base}/api/jobs/${created.job_id}`)).json()) as {
      status: string;
      url?: string;
    };
    if (view.status === "done") {
      const png = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
      writeFileSync(`${OUT}/${style.id}.webp`, await sharp(png).resize(SIDE, SIDE).webp({ quality: 80 }).toBuffer());
      break;
    }
    if (view.status === "failed" || view.status === "cancelled") {
      console.error(style.id, view);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`[${i + 1}/${todo.length}] ${style.id} ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
