// Restoration spikes (spec §14, decision 32): a section through the real pipeline (cleanup →
// SeedVR2 chunks → join) with small chunks to exercise the padding and the join.
// Usage: node --env-file=.env scripts/spikes/restore.ts [file] [start] [seconds] [chunkFrames] [clean|upscale]
// Writes storage/spikes/restore/out-<mode>.mp4.
import path from "node:path";
import { ComfyClient } from "../../src/lib/comfy/client.ts";
import { getConfig } from "../../src/lib/config.ts";
import { frameCount, measure, probe } from "../../src/lib/ffmpeg.ts";
import { runRestore } from "../../src/lib/jobs/restore.ts";
import type { RestoreMode } from "../../src/lib/restore.ts";
import { loadTemplate } from "../../src/lib/workflow/templates.ts";

const [file = "storage/spikes/restore/a.mpg", start = "3", seconds = "2", chunkFrames = "33", mode = "upscale"] = process.argv.slice(2);
const base = getConfig();
const config = { ...base, restore: { ...base.restore, chunkFrames: Number(chunkFrames) } };
const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-spike-${Date.now()}`, timeoutMs: 120_000 });

const info = await probe(file);
if (!info) throw new Error(`not a video: ${file}`);
const measurements = await measure(file, info);
console.log(JSON.stringify({ info, measurements }));
const out = path.resolve(`storage/spikes/restore/out-${mode}.mp4`);
const t0 = Date.now();
let last = -1;
await runRestore(
  {
    jobId: `spike${Date.now()}`,
    file,
    info,
    measurements,
    section: { start: Number(start), seconds: Number(seconds), color: "normalize", mode: mode as RestoreMode },
    state: { chunksDone: 0 },
  },
  {
    client,
    config,
    template: () => loadTemplate("restore_seedvr2"),
    signal: new AbortController().signal,
    onProgress: (share) => {
      const pct = Math.floor(share * 100);
      if (pct !== last) process.stdout.write(`${pct}% `);
      last = pct;
    },
    saveState: async (state) => console.log("\nstate", JSON.stringify(state), `${((Date.now() - t0) / 1000).toFixed(0)} s`),
  },
  out,
);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)} s:`, JSON.stringify(await probe(out)), "frames", await frameCount(out));
