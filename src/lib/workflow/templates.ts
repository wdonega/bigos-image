import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApiGraph } from "./graph.ts";

export type WorkflowName = "t2i" | "edit" | "video_fl2va" | "video_ref2va" | "music";

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
