import { readFileSync } from "node:fs";
import path from "node:path";
import type { EffectWorkflow } from "../effects.ts";
import type { ApiGraph } from "./graph.ts";

export type WorkflowName = ImageWorkflow | "video_fl2va" | "video_ref2va" | "music" | EffectWorkflow | "restore_seedvr2" | "restore_seedvr2_v2";

/**
 * Image graphs (spec §14, decision 34): Krea 2 Turbo for quality Normal, Flux 3 Klein for High and
 * for every request with images; Qwen-Image 2.1 (`t2i`/`edit`) only with a transparent background.
 */
export type ImageWorkflow = "t2i" | "edit" | "t2i_krea" | "t2i_flux" | "edit_flux";

/** File names that don't follow `<name>_api.json` (the music export kept its original name). */
const FILES: Partial<Record<WorkflowName, string>> = { music: "audio_minimax_music_3.json" };

const cache = new Map<WorkflowName, ApiGraph>();

/** Returns a fresh copy of workflows/api/<name>_api.json (or FILES[name]); callers may mutate it. */
export function loadTemplate(name: WorkflowName): ApiGraph {
  let graph = cache.get(name);
  if (!graph) {
    const file = path.join(process.cwd(), "workflows", "api", FILES[name] ?? `${name}_api.json`);
    graph = JSON.parse(readFileSync(file, "utf8")) as ApiGraph;
    cache.set(name, graph);
  }
  return structuredClone(graph);
}
