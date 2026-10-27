import {
  ANIMATE_TEMPLATE_FRAMES,
  type EffectText,
  type EffectWorkflow,
  animateFrames,
  animateSize,
  characterPrompt,
  loadSize,
} from "../effects.ts";
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

// Krea 2 Turbo and Flux 3 Klein (spec §14, decision 34): CLIPTextEncode takes the prompt, and steps,
// cfg and sampler stay as the template has them (distilled models with a fixed schedule).
export type ModelT2IParams = { prompt: string; width: number; height: number; seed: number };

export function buildModelT2I(template: ApiGraph, p: ModelT2IParams): ApiGraph {
  const graph = structuredClone(template);
  setInputs(graph, "@prompt", { text: p.prompt });
  setInputs(graph, "@latent_size", { width: p.width, height: p.height });
  setInputs(graph, "@sampler", { seed: p.seed });
  return graph;
}

/** The nodes of one reference image in the Flux graph, image_1's titles; cloned per extra image. */
const FLUX_REF_CHAIN = ["@image_1", "@ref_scale_1", "@ref_encode_1", "@ref_pos_1", "@ref_neg_1"] as const;

export type FluxEditParams = ModelT2IParams & {
  /** ComfyUI file names (from /upload/image), image_1 first. */
  images: string[];
};

/**
 * Flux 3 Klein with images: each one goes through its own @ref_* chain, and the ReferenceLatent
 * nodes are chained on both conditionings (image_2 after image_1, and so on) before the sampler.
 */
export function buildFluxEdit(template: ApiGraph, p: FluxEditParams): ApiGraph {
  if (p.images.length < 1 || p.images.length > MAX_ENCODER_IMAGES) {
    throw new WorkflowError(`Flux edit needs 1 to ${MAX_ENCODER_IMAGES} images, got ${p.images.length}`);
  }
  const graph = buildModelT2I(template, p);
  setInputs(graph, "@image_1", { image: p.images[0] });
  const ids = Object.fromEntries(FLUX_REF_CHAIN.map((t) => [t, findNodeId(graph, t)]));
  const sampler = graph[findNodeId(graph, "@sampler")];
  if (!isLinkTo(sampler.inputs.positive, ids["@ref_pos_1"]) || !isLinkTo(sampler.inputs.negative, ids["@ref_neg_1"])) {
    throw new WorkflowError("@sampler is not fed by @ref_pos_1/@ref_neg_1");
  }
  let pos = ids["@ref_pos_1"];
  let neg = ids["@ref_neg_1"];
  p.images.slice(1).forEach((name, i) => {
    const n = i + 2;
    const id = (title: string) => `${ids[title]}_${n}`;
    for (const title of FLUX_REF_CHAIN) {
      const clone = structuredClone(graph[ids[title]]);
      clone._meta = { title: title.replace(/_1$/, `_${n}`) };
      graph[id(title)] = clone;
    }
    graph[id("@image_1")].inputs.image = name;
    graph[id("@ref_scale_1")].inputs.image = [id("@image_1"), 0];
    graph[id("@ref_encode_1")].inputs.pixels = [id("@ref_scale_1"), 0];
    Object.assign(graph[id("@ref_pos_1")].inputs, { conditioning: [pos, 0], latent: [id("@ref_encode_1"), 0] });
    Object.assign(graph[id("@ref_neg_1")].inputs, { conditioning: [neg, 0], latent: [id("@ref_encode_1"), 0] });
    pos = id("@ref_pos_1");
    neg = id("@ref_neg_1");
  });
  sampler.inputs.positive = [pos, 0];
  sampler.inputs.negative = [neg, 0];
  return graph;
}

const isLinkTo = (value: unknown, id: string) => Array.isArray(value) && value[0] === id;

// Video (spec §14, decision 28). MiniMaxH3ReferenceToVideo's `ref_images` is an autogrow group
// with prefix "ref_image_" and at most 9 entries (GET /object_info); in API format each one is
// "ref_images.ref_image_N" (checked against ComfyUI in the m5 spike).
export const MAX_VIDEO_REFS = 9;
const refInput = (n: number) => `ref_images.ref_image_${n}`;

export type VideoParams = {
  prompt: string;
  width: number;
  height: number;
  /** Frames at 24 fps on H3's 17k + 5 grid. */
  frames: number;
  seed: number;
  /** ComfyUI file names (from /upload/image); empty on the text-to-video graph. */
  images: string[];
};

/**
 * Video graphs: `video_fl2va` (no references) or `video_ref2va` (@image_1 cloned per reference,
 * like the edit graph). Steps and sampler are fixed in the graph (3-step LoRA).
 */
export function buildVideo(template: ApiGraph, p: VideoParams): ApiGraph {
  const graph = structuredClone(template);
  setInputs(graph, "@video", { prompt: p.prompt, width: p.width, height: p.height, length: p.frames });
  setInputs(graph, "@seed", { noise_seed: p.seed });
  if (p.images.length === 0) return graph;
  if (p.images.length > MAX_VIDEO_REFS) {
    throw new WorkflowError(`Video takes at most ${MAX_VIDEO_REFS} references, got ${p.images.length}`);
  }
  setInputs(graph, "@image_1", { image: p.images[0] });
  const firstId = findNodeId(graph, "@image_1");
  const video = graph[findNodeId(graph, "@video")];
  const firstLink = video.inputs[refInput(1)];
  if (!Array.isArray(firstLink) || firstLink[0] !== firstId) {
    throw new WorkflowError(`@video input "${refInput(1)}" is not linked to @image_1`);
  }
  p.images.slice(1).forEach((name, i) => {
    const n = i + 2;
    const id = `${firstId}_image_${n}`;
    const clone = structuredClone(graph[firstId]);
    clone.inputs.image = name;
    clone._meta = { title: `@image_${n}` };
    graph[id] = clone;
    video.inputs[refInput(n)] = [id, 0];
  });
  return graph;
}

export type MusicParams = {
  /** Caption in the model's layout (Global Metadata / Vocal Details / Arrangement). */
  caption: string;
  /** Lyrics with section tags, or "[Instrumental]". */
  lyrics: string;
  /** Upper bound; the model may end the song earlier. */
  seconds: number;
  seed: number;
};

/** Music graph (MiniMax Music 3): @seed feeds both the encoder and the sampler. */
export function buildMusic(template: ApiGraph, p: MusicParams): ApiGraph {
  const graph = structuredClone(template);
  setInputs(graph, "@music", { caption: p.caption, lyrics: p.lyrics, max_duration: p.seconds });
  setInputs(graph, "@seed", { seed: p.seed });
  return graph;
}

// Video effects (spec §14, decision 31): graphs derived from ../comfyui-workflows (workflows/README.md).

export type EffectParams = {
  workflow: EffectWorkflow;
  /** ComfyUI file names (from /upload/image): the video, the face/character photo, the first frame. */
  video: string;
  photo: string | null;
  frame: string | null;
  /** Size and frame rate of the section sent (cut and normalized by the worker). */
  videoSize: Size;
  fps: number;
  /** Length of the section. */
  seconds: number;
  text: EffectText;
  seed: number;
};

const required = (value: string | null | undefined, what: string): string => {
  if (!value) throw new WorkflowError(`Effect graph needs ${what}`);
  return value;
};

export function buildEffect(template: ApiGraph, p: EffectParams): ApiGraph {
  const graph = structuredClone(template);
  switch (p.workflow) {
    case "fx_clean_plate":
      setInputs(graph, "@video_in", { file: p.video });
      setInputs(graph, "@trim", { duration: p.seconds });
      setInputs(graph, "@prompt", { text: required(p.text.scene, "a scene") });
      setInputs(graph, "@negative", { text: required(p.text.remove, "what to remove") });
      setInputs(graph, "@seed", { noise_seed: p.seed });
      // The first-frame branch is bypassed in the graph, but LoadImage still needs a real file.
      setInputs(graph, "@first_frame", { image: required(p.frame ?? p.photo, "a first-frame image") });
      break;
    case "fx_face_swap": {
      const maxSide = Number(graph[findNodeId(graph, "@max_side")].inputs.value);
      const load = loadSize(p.videoSize, maxSide);
      setInputs(graph, "@video_in", { video: p.video, custom_width: load.width, custom_height: load.height });
      setInputs(graph, "@duration", { value: p.seconds });
      setInputs(graph, "@image_1", { image: required(p.photo, "a face photo") });
      setInputs(graph, "@prompt", { value: required(p.text.scene, "a scene") });
      setInputs(graph, "@seed", { noise_seed: p.seed });
      break;
    }
    case "fx_animate": {
      const sizeNode = graph[findNodeId(graph, "@size")].inputs;
      const size = animateSize(p.videoSize, Number(sizeNode["resize_type.width"]) * Number(sizeNode["resize_type.height"]));
      setInputs(graph, "@video_in", { file: p.video });
      setInputs(graph, "@trim", { duration: p.seconds });
      setInputs(graph, "@size", { "resize_type.width": size.width, "resize_type.height": size.height });
      // Past the template's 81 frames (~3.4 s) the model needs its context windows.
      const frames = animateFrames(p.seconds, p.fps);
      setInputs(graph, "@frames", { length: frames });
      setInputs(graph, "@windows", { switch: frames > ANIMATE_TEMPLATE_FRAMES });
      setInputs(graph, "@image_1", { image: required(p.photo, "a character photo") });
      setInputs(graph, "@prompt", { value: required(p.text.action, "an action") });
      setInputs(graph, "@character", { value: characterPrompt(required(p.text.character, "a character description")) });
      setInputs(graph, "@seed", { noise_seed: p.seed });
      break;
    }
    case "fx_character_swap":
      setInputs(graph, "@video_in", { file: p.video });
      setInputs(graph, "@prepare", { duration_seconds: p.seconds });
      setInputs(graph, "@image_1", { image: required(p.photo, "a character photo") });
      setInputs(graph, "@subject", { text: required(p.text.subject, "a subject") });
      setInputs(graph, "@seed", { seed: p.seed });
      break;
  }
  return graph;
}

/** Random seed below 2^53 so it survives JSON and JS numbers intact. */
export function randomSeed(): number {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return (high & 0x1fffff) * 2 ** 32 + low;
}
