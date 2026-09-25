import { describe, expect, it } from "vitest";
import { buildT2I, randomSeed } from "./build";
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
