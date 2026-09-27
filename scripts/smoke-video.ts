// End-to-end video check through the app's HTTP API (needs the app running and ComfyUI).
// Usage: pnpm smoke:video [base-url] [--refs]   (default http://localhost:3000)
// Creates a 5 s video (text only, or with the app icon as <Picture 1> with --refs), then checks
// the MP4 route: byte ranges (206) and H.264 + AAC tracks in the file.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const withRefs = args.includes("--refs");

let images: string[] = [];
if (withRefs) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync("docs/icons/icon_warm.png")], { type: "image/png" }), "cat.png");
  const up = (await (await fetch(`${base}/api/uploads`, { method: "POST", body: form })).json()) as { id: string };
  images = [up.id];
}

const body = {
  screen: "video",
  prompt: withRefs
    ? "O gato da [Imagem 1] pinta um quadro no ateliê e depois olha para a câmera, com um piano calmo ao fundo"
    : "Um golden retriever correndo na praia ao pôr do sol, ondas batendo",
  images,
  ratio: "16:9",
  duration: 5,
  quality: "normal",
};
const res = await fetch(`${base}/api/jobs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const created = (await res.json()) as { job_id?: string };
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
    media?: string;
    url?: string;
  };
  const line = JSON.stringify(view);
  if (line !== last) console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, line);
  last = line;
  if (view.status === "done") {
    const head = await fetch(`${base}${view.url}`, { headers: { range: "bytes=0-1" } });
    const full = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
    const checks = {
      media: view.media === "video",
      range206: head.status === 206 && head.headers.get("content-range")?.startsWith("bytes 0-1/") === true,
      mp4: head.headers.get("content-type") === "video/mp4",
      h264: full.includes("avc1"),
      aac: full.includes("mp4a"),
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(ok ? "OK" : "FAIL", JSON.stringify(checks), `${(full.length / 1e6).toFixed(1)} MB`);
    process.exit(ok ? 0 : 1);
  }
  if (view.status === "failed" || view.status === "cancelled") process.exit(1);
  await new Promise((r) => setTimeout(r, 2000));
}
