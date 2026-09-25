import type { Size } from "../size.ts";
import { type ApiGraph, WorkflowError, findNodeId, setInputs } from "./graph.ts";

// The encoder's `images` input is a COMFY_AUTOGROW_V3 group named image_1 … image_16
// (GET /object_info/TextEncodeQwenImage21); in API format each one is "images.image_N" (spec §14).
export const MAX_ENCODER_IMAGES = 16;
const imageInput = (n: number) => `images.image_${n}`;

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

export type EditParams = {
  prompt: string;
  /** ComfyUI file names (from /upload/image), image_1 first. */
  images: string[];
  /** null = "Original": the canvas follows image_1 (switch off, spec §7). */
  size: Size | null;
  seed: number;
  steps: number;
};

/** Edit workflow with 1 to 16 images: @image_1 is cloned for each extra image (spec §9.3). */
export function buildEdit(template: ApiGraph, p: EditParams): ApiGraph {
  if (p.images.length < 1 || p.images.length > MAX_ENCODER_IMAGES) {
    throw new WorkflowError(`Edit needs 1 to ${MAX_ENCODER_IMAGES} images, got ${p.images.length}`);
  }
  const graph = structuredClone(template);
  setInputs(graph, "@prompt", { prompt: p.prompt, negative_prompt: "", resolution: 0 });
  setInputs(graph, "@custom_size", { switch: p.size !== null });
  if (p.size) setInputs(graph, "@latent_size", { width: p.size.width, height: p.size.height });
  setInputs(graph, "@sampler", { seed: p.seed, steps: p.steps, ...FIXED_SAMPLING });
  setInputs(graph, "@image_1", { image: p.images[0] });

  const firstId = findNodeId(graph, "@image_1");
  const encoder = graph[findNodeId(graph, "@prompt")];
  const firstLink = encoder.inputs[imageInput(1)];
  if (!Array.isArray(firstLink) || firstLink[0] !== firstId) {
    throw new WorkflowError(`@prompt input "${imageInput(1)}" is not linked to @image_1`);
  }

  p.images.slice(1).forEach((name, i) => {
    const n = i + 2;
    const id = `${firstId}_image_${n}`;
    const clone = structuredClone(graph[firstId]);
    clone.inputs.image = name;
    clone._meta = { title: `@image_${n}` };
    graph[id] = clone;
    encoder.inputs[imageInput(n)] = [id, 0];
  });
  return graph;
}

/** Random seed below 2^53 so it survives JSON and JS numbers intact. */
export function randomSeed(): number {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return (high & 0x1fffff) * 2 ** 32 + low;
}
