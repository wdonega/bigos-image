import { describe, expect, it } from "vitest";
import { buildEdit, buildT2I, randomSeed } from "./build";
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
