// ComfyUI API-format graph helpers. Nodes are found by `_meta.title` (convention in
// workflows/README.md), never by id, because ids change on every export.

export type ApiNode = {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
};

export type ApiGraph = Record<string, ApiNode>;

/** A link to another node's output: [nodeId, outputIndex]. */
export type NodeLink = [string, number];

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export function findNodeId(graph: ApiGraph, title: string): string {
  const ids = Object.keys(graph).filter((id) => graph[id]._meta?.title === title);
  if (ids.length !== 1) {
    throw new WorkflowError(`Expected exactly 1 node titled "${title}", found ${ids.length}`);
  }
  return ids[0];
}

/**
 * Writes inputs on the node with this title. Inputs missing from the exported template are
 * refused: we never invent ComfyUI input names.
 */
export function setInputs(graph: ApiGraph, title: string, values: Record<string, unknown>): void {
  const node = graph[findNodeId(graph, title)];
  for (const [key, value] of Object.entries(values)) {
    if (!(key in node.inputs)) {
      throw new WorkflowError(`Node "${title}" (${node.class_type}) has no input "${key}"`);
    }
    node.inputs[key] = value;
  }
}
