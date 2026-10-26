import { describe, expect, it } from "vitest";
import { buildEdit, buildEffect, buildT2I, randomSeed, buildVideo, MAX_VIDEO_REFS } from "./build";
import { type ApiGraph, WorkflowError, findNodeId, setInputs } from "./graph";
import { loadTemplate } from "./templates";

const params = { prompt: "a cat", width: 1376, height: 768, seed: 7, steps: 40 };
const node = (g: ApiGraph, title: string) => g[findNodeId(g, title)].inputs;

describe("buildT2I", () => {
  it("writes the user values into the titled nodes", () => {
    const graph = buildT2I(loadTemplate("t2i"), params);
    expect(node(graph, "@prompt")).toMatchObject({ prompt: "a cat", negative_prompt: "" });
    expect(node(graph, "@latent_size")).toMatchObject({ width: 1376, height: 768, batch_size: 1 });
    expect(node(graph, "@sampler")).toMatchObject({
      seed: 7,
      steps: 40,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
    });
  });

  it("does not mutate the template", () => {
    const template = loadTemplate("t2i");
    const before = JSON.stringify(template);
    buildT2I(template, params);
    expect(JSON.stringify(template)).toBe(before);
  });
});

describe("buildEdit", () => {
  const edit = { prompt: "<image1> na praia", seed: 3, steps: 25 };

  it("Original: switch off, resolution 0, single image", () => {
    const graph = buildEdit(loadTemplate("edit"), { ...edit, images: ["a.png"], size: null });
    expect(node(graph, "@custom_size").switch).toBe(false);
    expect(node(graph, "@prompt")).toMatchObject({ prompt: "<image1> na praia", resolution: 0 });
    expect(node(graph, "@image_1").image).toBe("a.png");
    expect(Object.values(graph).filter((n) => n.class_type === "LoadImage")).toHaveLength(1);
  });

  it("custom size: switch on and latent size written", () => {
    const graph = buildEdit(loadTemplate("edit"), {
      ...edit,
      images: ["a.png"],
      size: { width: 1376, height: 768 },
    });
    expect(node(graph, "@custom_size").switch).toBe(true);
    expect(node(graph, "@latent_size")).toMatchObject({ width: 1376, height: 768 });
  });

  it("clones @image_1 for every extra image and links images.image_N in order", () => {
    const names = Array.from({ length: 10 }, (_, i) => `img${i + 1}.png`);
    const graph = buildEdit(loadTemplate("edit"), { ...edit, images: names, size: { width: 1024, height: 1024 } });
    const encoder = node(graph, "@prompt");
    names.forEach((name, i) => {
      const n = i + 1;
      const id = findNodeId(graph, `@image_${n}`);
      expect(graph[id]).toMatchObject({ class_type: "LoadImage", inputs: { image: name } });
      expect(encoder[`images.image_${n}`]).toEqual([id, 0]);
    });
  });

  it("refuses zero images or more than the encoder accepts", () => {
    expect(() => buildEdit(loadTemplate("edit"), { ...edit, images: [], size: null })).toThrow(WorkflowError);
    const many = Array.from({ length: 17 }, (_, i) => `${i}.png`);
    expect(() => buildEdit(loadTemplate("edit"), { ...edit, images: many, size: null })).toThrow(WorkflowError);
  });
});

describe("graph helpers", () => {
  it("refuses inputs that the exported node does not have", () => {
    const graph = loadTemplate("t2i");
    expect(() => setInputs(graph, "@latent_size", { depth: 3 })).toThrow(WorkflowError);
  });

  it("requires exactly one node per title", () => {
    const graph = loadTemplate("t2i");
    expect(() => findNodeId(graph, "@missing")).toThrow(/found 0/);
    const id = findNodeId(graph, "@save");
    graph.copy = structuredClone(graph[id]);
    expect(() => findNodeId(graph, "@save")).toThrow(/found 2/);
  });

  it("finds every title of the edit workflow", () => {
    const graph = loadTemplate("edit");
    for (const title of ["@prompt", "@latent_size", "@sampler", "@custom_size", "@image_1", "@save"]) {
      expect(() => findNodeId(graph, title)).not.toThrow();
    }
  });
});

describe("randomSeed", () => {
  it("returns safe integers that differ between calls", () => {
    const seeds = new Set(Array.from({ length: 20 }, randomSeed));
    expect(seeds.size).toBe(20);
    for (const s of seeds) expect(Number.isSafeInteger(s) && s >= 0).toBe(true);
  });
});

describe("buildVideo", () => {
  const video = { prompt: "detailed_description: a dog", width: 1280, height: 736, frames: 124, seed: 7 };

  it("text to video: writes prompt, size, frames and seed on the native graph", () => {
    const graph = buildVideo(loadTemplate("video_fl2va"), { ...video, images: [] });
    const node = graph[findNodeId(graph, "@video")];
    expect(node.class_type).toBe("MiniMaxH3ImageToVideo");
    expect(node.inputs).toMatchObject({ prompt: video.prompt, width: 1280, height: 736, length: 124 });
    expect(graph[findNodeId(graph, "@seed")].inputs.noise_seed).toBe(7);
    expect(Object.values(graph).some((n) => n.class_type === "MiniMaxH3DirectorCS")).toBe(false);
  });

  it("references: clones @image_1 and links each one to ref_images.ref_image_N", () => {
    const graph = buildVideo(loadTemplate("video_ref2va"), { ...video, images: ["a.png", "b.png", "c.png"] });
    const node = graph[findNodeId(graph, "@video")];
    expect(node.class_type).toBe("MiniMaxH3ReferenceToVideo");
    for (const [i, name] of ["a.png", "b.png", "c.png"].entries()) {
      const id = findNodeId(graph, `@image_${i + 1}`);
      expect(graph[id].inputs.image).toBe(name);
      expect(node.inputs[`ref_images.ref_image_${i + 1}`]).toEqual([id, 0]);
    }
  });

  it("rejects more references than the node takes", () => {
    const names = Array.from({ length: MAX_VIDEO_REFS + 1 }, (_, i) => `${i}.png`);
    expect(() => buildVideo(loadTemplate("video_ref2va"), { ...video, images: names })).toThrow(WorkflowError);
  });
});

describe("buildEffect (spec §14, decision 31)", () => {
  const base = {
    video: "bigos-v.mp4",
    photo: "bigos-p.png",
    frame: "bigos-v_frame.png",
    videoSize: { width: 1280, height: 736 },
    fps: 24,
    seconds: 4.5,
    seed: 7,
  };

  it("clean plate: video, trim, scene, what to remove, seed and the bypassed first frame", () => {
    const g = buildEffect(loadTemplate("fx_clean_plate"), {
      ...base,
      workflow: "fx_clean_plate",
      photo: null,
      text: { scene: "An empty ring.", remove: "person, boxer" },
    });
    expect(node(g, "@video_in")).toMatchObject({ file: "bigos-v.mp4" });
    expect(node(g, "@trim")).toMatchObject({ duration: 4.5, start_time: 0 });
    expect(node(g, "@prompt")).toMatchObject({ text: "An empty ring." });
    expect(node(g, "@negative")).toMatchObject({ text: "person, boxer" });
    expect(node(g, "@seed")).toMatchObject({ noise_seed: 7 });
    expect(node(g, "@first_frame")).toMatchObject({ image: "bigos-v_frame.png" });
  });

  it("face swap: decodes at the template's max side, keeps the duration, face and scene", () => {
    const g = buildEffect(loadTemplate("fx_face_swap"), {
      ...base,
      workflow: "fx_face_swap",
      videoSize: { width: 2160, height: 3840 },
      text: { scene: "An old woman boxing." },
    });
    expect(node(g, "@video_in")).toMatchObject({ video: "bigos-v.mp4", custom_width: 720, custom_height: 1280 });
    expect(node(g, "@duration")).toMatchObject({ value: 4.5 });
    expect(node(g, "@image_1")).toMatchObject({ image: "bigos-p.png" });
    expect(node(g, "@prompt")).toMatchObject({ value: "An old woman boxing." });
    expect(node(g, "@seed")).toMatchObject({ noise_seed: 7 });
  });

  it("animate: frames follow the section; context windows only past the template's 81 frames", () => {
    const short = buildEffect(loadTemplate("fx_animate"), { ...base, workflow: "fx_animate", seconds: 3, text: { character: "a", action: "b" } });
    expect(node(short, "@frames")).toMatchObject({ length: 73 });
    expect(node(short, "@windows")).toMatchObject({ switch: false });
    const long = buildEffect(loadTemplate("fx_animate"), { ...base, workflow: "fx_animate", seconds: 10, text: { character: "a", action: "b" } });
    expect(node(long, "@frames")).toMatchObject({ length: 241 });
    expect(node(long, "@windows")).toMatchObject({ switch: true });
  });

  it("animate: output follows the video's orientation with the template's pixels", () => {
    const g = buildEffect(loadTemplate("fx_animate"), {
      ...base,
      workflow: "fx_animate",
      text: { character: "an owl", action: "The owl dances." },
    });
    const size = node(g, "@size");
    expect(Number(size["resize_type.width"])).toBeGreaterThan(Number(size["resize_type.height"]));
    expect(node(g, "@character")).toMatchObject({ value: "Character appearance description: an owl" });
    expect(node(g, "@prompt")).toMatchObject({ value: "The owl dances." });
    expect(node(g, "@trim")).toMatchObject({ duration: 4.5 });
    expect(node(g, "@image_1")).toMatchObject({ image: "bigos-p.png" });
  });

  it("character swap: duration in the Relay prepare node, subject for the detector", () => {
    const g = buildEffect(loadTemplate("fx_character_swap"), {
      ...base,
      workflow: "fx_character_swap",
      text: { subject: "the man" },
    });
    expect(node(g, "@video_in")).toMatchObject({ file: "bigos-v.mp4" });
    expect(node(g, "@prepare")).toMatchObject({ duration_seconds: 4.5 });
    expect(node(g, "@subject")).toMatchObject({ text: "the man" });
    expect(node(g, "@seed")).toMatchObject({ seed: 7 });
  });

  it("refuses to build without what the graph needs", () => {
    expect(() =>
      buildEffect(loadTemplate("fx_face_swap"), { ...base, workflow: "fx_face_swap", photo: null, text: { scene: "x" } }),
    ).toThrow(WorkflowError);
    expect(() => buildEffect(loadTemplate("fx_animate"), { ...base, workflow: "fx_animate", text: {} })).toThrow(WorkflowError);
  });
});
