import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApiGraph } from "./graph.ts";

export type WorkflowName = "t2i" | "edit";

const cache = new Map<WorkflowName, ApiGraph>();

/** Returns a fresh copy of workflows/api/<name>_api.json; callers may mutate it. */
export function loadTemplate(name: WorkflowName): ApiGraph {
  let graph = cache.get(name);
  if (!graph) {
    const file = path.join(process.cwd(), "workflows", "api", `${name}_api.json`);
    graph = JSON.parse(readFileSync(file, "utf8")) as ApiGraph;
    cache.set(name, graph);
  }
  return structuredClone(graph);
}
