import { type ApiGraph, setInputs } from "./graph.ts";

// Fixed and hidden from the user (spec §8.1).
export const FIXED_SAMPLING = { cfg: 1, sampler_name: "euler", scheduler: "simple" } as const;

export type T2IParams = {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
};

export function buildT2I(template: ApiGraph, p: T2IParams): ApiGraph {
  const graph = structuredClone(template);
  setInputs(graph, "@prompt", { prompt: p.prompt, negative_prompt: "" });
  setInputs(graph, "@latent_size", { width: p.width, height: p.height });
  setInputs(graph, "@sampler", { seed: p.seed, steps: p.steps, ...FIXED_SAMPLING });
  return graph;
}

/** Random seed below 2^53 so it survives JSON and JS numbers intact. */
export function randomSeed(): number {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return (high & 0x1fffff) * 2 ** 32 + low;
}
