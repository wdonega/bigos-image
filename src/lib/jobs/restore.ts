// Restoration pipeline (spec §14, decision 32), the script's main loop: ffmpeg cleanup → (upscale)
// SeedVR2 in ComfyUI chunk by chunk → join with the cleaned audio. Every step leaves its file in the
// "work" area, so a job resumed after a restart picks up at the first missing chunk.
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ComfyClient, ComfyError } from "../comfy/client.ts";
import { outputVideo, runPrompt } from "../comfy/run.ts";
import type { Config } from "../config.ts";
import { FfmpegError, chunk, clean, frameCount, join, probe, trimFrames } from "../ffmpeg.ts";
import { type ColorId, type MediaInfo, type Measurements, type RestoreMode, chunkPlan, upscaleTarget } from "../restore.ts";
import { storageFile } from "../storage.ts";
import { type ApiGraph, findNodeId, setInputs } from "../workflow/graph.ts";

/** Upscale target height: 1080 looks the same on VHS (~250 lines of real detail) and costs ~1.5× (script's tests). */
export const UPSCALE_HEIGHT = 720;
/** x264 quality of the cleaned intermediate (an upscale follows) and of what the user receives. */
const CRF_INTERMEDIATE = 14;
const CRF_FINAL = 18;
/** Share of the progress bar given to the cleanup when an upscale follows (it is ~1/60 of the time). */
const CLEAN_SHARE = 0.02;

/** Saved in the job data after each step, so a restarted worker resumes instead of starting over. */
export type RestoreState = { chunksDone: number; chunk?: number; promptId?: string };

export type RestoreInput = {
  jobId: string;
  /** The uploaded file and what the upload measured. */
  file: string;
  info: MediaInfo;
  measurements: Measurements;
  section: { start: number; seconds: number; color: ColorId; mode: RestoreMode };
  state: RestoreState;
};

export type RestoreDeps = {
  client: ComfyClient;
  config: Config;
  template: () => ApiGraph;
  signal: AbortSignal;
  /** 0..1 over the whole job. */
  onProgress: (share: number) => void;
  saveState: (state: RestoreState) => Promise<void>;
};

const exists = (file: string) => stat(file).then(
  () => true,
  () => false,
);

/** Restores the section into `out` (an MP4 the caller stores as the result). */
export async function runRestore(input: RestoreInput, deps: RestoreDeps, out: string): Promise<void> {
  const { config, signal } = deps;
  const work = (name: string) => storageFile(config, "work", `${input.jobId}-${name}`);
  const { section } = input;
  const upscale = section.mode === "upscale";
  const cleanTo = upscale ? work("cleaned.mp4") : out;
  await mkdir(path.dirname(work("cleaned.mp4")), { recursive: true });

  if (!upscale || !(await exists(cleanTo))) {
    const part = upscale ? CLEAN_SHARE : 1;
    await clean(
      input.file,
      input.info,
      input.measurements,
      { start: section.start, seconds: section.seconds, color: section.color, crf: upscale ? CRF_INTERMEDIATE : CRF_FINAL },
      cleanTo,
      { signal, onTime: (t) => deps.onProgress(part * Math.min(t / section.seconds, 1)) },
    );
  }
  if (!upscale) return;

  const cleaned = await probe(cleanTo);
  if (!cleaned) throw new FfmpegError("cleaned video unreadable", "");
  const target = upscaleTarget(config.restore.upscaler, cleaned, UPSCALE_HEIGHT);
  const total = await frameCount(cleanTo);
  const chunks = chunkPlan(total, config.restore.chunkFrames);
  let state = input.state;

  for (let i = state.chunksDone; i < chunks.length; i++) {
    if (signal.aborted) throw new ComfyError("interrupted", "cancelled");
    const c = chunks[i];
    const segment = work(`seg-${i}.mp4`);
    const done = work(`up-${i}.mp4`);
    if (!(await exists(done))) {
      // A prompt already queued for this chunk (before a restart) is followed, not queued again.
      const knownPromptId = state.chunk === i ? state.promptId : undefined;
      const graph = deps.template();
      if (!knownPromptId) {
        await chunk(cleanTo, c, segment);
        const name = await deps.client.uploadImage(await readFile(segment), `bigos-restore-${input.jobId}-${i}.mp4`, "video/mp4");
        setInputs(graph, "@video_in", { file: name });
      }
      setInputs(graph, target.node, target.inputs);
      // v2 keeps the seed in the upscaler node, v1 in its KSampler.
      setInputs(graph, config.restore.upscaler === "gguf" ? "@upscale" : "@seed", { seed: (Number.parseInt(input.jobId, 10) || 0) + i });
      const { entry } = await runPrompt(deps.client, graph, {
        timeoutMs: config.restore.chunkTimeoutMs,
        outageMs: config.comfyWakeMs,
        knownPromptId,
        onPromptId: async (promptId) => {
          state = { ...state, chunk: i, promptId };
          await deps.saveState(state);
        },
        signal,
      });
      const upscaled = work(`res-${i}.mp4`);
      await writeFile(upscaled, await deps.client.view(outputVideo(entry, findNodeId(graph, "@save"))));
      await trimFrames(upscaled, c.frames, done);
      await Promise.all([rm(upscaled, { force: true }), rm(segment, { force: true })]);
      const got = await frameCount(done);
      if (got !== c.frames) {
        await rm(done, { force: true });
        throw new FfmpegError(`chunk ${i + 1}: expected ${c.frames} frames, SeedVR2 returned ${got}`, "");
      }
    }
    state = { chunksDone: i + 1 };
    await deps.saveState(state);
    // The join still follows: never report 100% before it.
    deps.onProgress(CLEAN_SHARE + (1 - CLEAN_SHARE) * 0.98 * ((i + 1) / chunks.length));
  }

  const list = work("list.txt");
  await writeFile(list, chunks.map((_, i) => `file '${work(`up-${i}.mp4`)}'\n`).join(""));
  await join(list, cleanTo, out, CRF_FINAL);
  const joined = await frameCount(out);
  if (joined !== total) throw new FfmpegError(`joined video has ${joined} frames, expected ${total}`, "");
}

/** Deletes a job's intermediate files (after success, failure or cancellation). */
export async function removeWork(config: Config, jobId: string): Promise<void> {
  const dir = path.dirname(storageFile(config, "work", `${jobId}-x.mp4`));
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(`${jobId}-`)).map((n) => rm(path.join(dir, n), { force: true })));
}
