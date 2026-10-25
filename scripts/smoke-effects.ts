// End-to-end video effect check through the app's HTTP API (needs the app running and ComfyUI).
// Usage: pnpm smoke:effects [effect] [base-url] [--video file.mp4] [--frame frame.png] [--photo photo.png]
//   effect: remove_people (default) | face_swap | animate | character_swap
// Uploads the video (with its first frame, as the browser does) and the photo when the effect
// needs one, runs the effect and checks the MP4 result (H.264 video, audio track, size).
import { readFileSync } from "node:fs";
import path from "node:path";
import { readVideoInfo } from "../src/lib/mp4.ts";

const EFFECTS = ["remove_people", "face_swap", "animate", "character_swap"];
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const effect = positional.find((a) => EFFECTS.includes(a)) ?? "remove_people";
const base = positional.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const videoFile = option("video", "storage/spikes/effects/inputs/boxer.mp4");
const frameFile = option("frame", "storage/spikes/effects/inputs/boxer-frame.png");
const photoFile = option("photo", "storage/spikes/effects/inputs/face.png");

async function upload(file: string, frame?: string): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)]), path.basename(file));
  if (frame) form.append("frame", new Blob([readFileSync(frame)], { type: "image/png" }), "frame.png");
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`upload of ${file} failed`, res.status, body);
    process.exit(1);
  }
  return body;
}

const video = await upload(videoFile, frameFile || undefined);
console.log("video", JSON.stringify(video));
const photo = effect === "remove_people" ? null : await upload(photoFile);

const prompts: Record<string, string> = {
  remove_people: "o boxeador",
  face_swap: "",
  animate: "a coruja se prepara para lutar boxe",
  character_swap: "o boxeador",
};
const res = await fetch(`${base}/api/jobs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    screen: "effects",
    effect,
    video: video.id,
    images: photo ? [photo.id] : [],
    prompt: prompts[effect],
    consent: true,
  }),
});
const created = (await res.json()) as { job_id?: string };
if (!res.ok || !created.job_id) {
  console.error("POST /api/jobs failed", res.status, created);
  process.exit(1);
}
console.log("job", created.job_id, effect);

const started = Date.now();
let last = "";
for (;;) {
  const view = (await (await fetch(`${base}/api/jobs/${created.job_id}`)).json()) as {
    status: string;
    media?: string;
    url?: string;
    width?: number;
    height?: number;
  };
  const line = JSON.stringify(view);
  if (line !== last) console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, line);
  last = line;
  if (view.status === "done") {
    const full = Buffer.from(await (await fetch(`${base}${view.url}`)).arrayBuffer());
    const info = readVideoInfo(full);
    const checks = {
      media: view.media === "video",
      h264: full.includes("avc1"),
      audio: info?.hasAudio === true,
      size: !!info && info.width === view.width && info.height === view.height,
      seconds: !!info && info.seconds > 1,
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(ok ? "OK" : "FAIL", JSON.stringify(checks), JSON.stringify(info), `${(full.length / 1e6).toFixed(1)} MB`);
    process.exit(ok ? 0 : 1);
  }
  if (view.status === "failed" || view.status === "cancelled") process.exit(1);
  await new Promise((r) => setTimeout(r, 3000));
}
