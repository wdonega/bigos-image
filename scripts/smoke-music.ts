// End-to-end music check through the app's HTTP API (needs the app running and ComfyUI).
// Usage: pnpm smoke:music [base-url] [--instrumental]   (default http://localhost:3000)
// Creates a 30 s song (Portuguese lyrics, or instrumental), then checks the MP3 route: byte ranges
// (206), audio/mpeg, and a real duration close to the asked one.
import { mp3Duration } from "../src/lib/audio.ts";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const instrumental = args.includes("--instrumental");

const body = {
  screen: "music",
  prompt: instrumental ? "música calma de piano para estudar à noite" : "um samba animado sobre o fim de semana com os amigos",
  lyrics: "[Verse]\nChegou o sábado, o sol abriu\nA turma toda já se reuniu\n\n[Chorus]\nÔ, ô, ô, deixa o samba me levar",
  instrumental,
  genre: instrumental ? null : "samba",
  duration: 30,
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
    seconds?: number;
  };
  const line = JSON.stringify(view);
  if (line !== last) console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, line);
  last = line;
  if (view.status === "done") {
    const head = await fetch(`${base}${view.url}`, { headers: { range: "bytes=0-1" } });
    const full = new Uint8Array(await (await fetch(`${base}${view.url}`)).arrayBuffer());
    const seconds = mp3Duration(full);
    const checks = {
      media: view.media === "audio",
      range206: head.status === 206,
      mpeg: head.headers.get("content-type") === "audio/mpeg",
      duration: seconds > 20 && seconds <= 31,
      reported: Math.abs((view.seconds ?? 0) - seconds) < 0.2,
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(ok ? "OK" : "FAIL", JSON.stringify(checks), `${seconds.toFixed(1)} s, ${(full.length / 1e6).toFixed(1)} MB`);
    process.exit(ok ? 0 : 1);
  }
  if (view.status === "failed" || view.status === "cancelled") process.exit(1);
  await new Promise((r) => setTimeout(r, 2000));
}
