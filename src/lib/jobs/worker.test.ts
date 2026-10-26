import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { MIN_TRANSPARENT_SHARE, finalizeImage, resolveEffectText, resolvePrompt, transparentShare } from "./worker";

async function rgbaPng(alpha: number) {
  return sharp({
    create: { width: 64, height: 32, channels: 4, background: { r: 200, g: 10, b: 10, alpha: alpha / 255 } },
  })
    .png()
    .toBuffer();
}

describe("finalizeImage", () => {
  it("drops the noisy alpha channel of opaque results", async () => {
    const out = await finalizeImage(await rgbaPng(240), false);
    const meta = await sharp(out.png).metadata();
    expect(meta.hasAlpha).toBe(false);
    expect(out).toMatchObject({ width: 64, height: 32 });
  });

  it("delivers transparent results untouched", async () => {
    const png = await rgbaPng(0);
    const out = await finalizeImage(png, true);
    expect(out.png).toBe(png);
    expect(out).toMatchObject({ width: 64, height: 32 });
  });
});

describe("transparentShare", () => {
  it("measures the share of clear pixels", async () => {
    expect(await transparentShare(await rgbaPng(0))).toBe(1);
    expect(await transparentShare(await rgbaPng(240))).toBe(0);
  });

  it("treats images without alpha as opaque", async () => {
    const opaque = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(await transparentShare(opaque)).toBeLessThan(MIN_TRANSPARENT_SHARE);
  });
});

describe("resolvePrompt", () => {
  const data = {
    text: "um gato",
    style: "watercolor painting",
    fallbackPrompt: "um gato. watercolor painting.",
    images: ["u1"],
  };
  const llm = { url: "https://llm.test", apiKey: "k", model: "prompt-enhancer", maxOutputTokens: 800, maxInputChars: 4000, disableThinking: false };

  it("uses the LLM's final prompt", async () => {
    const finalize = vi.fn(async () => "Watercolor painting of a cat");
    expect(await resolvePrompt(data, llm, finalize)).toBe("Watercolor painting of a cat");
    expect(finalize).toHaveBeenCalledWith(llm, "um gato", "watercolor painting", 1);
  });

  it("falls back without an LLM, with long texts or when the LLM fails", async () => {
    const finalize = vi.fn(async () => "never");
    expect(await resolvePrompt(data, null, finalize)).toBe(data.fallbackPrompt);
    const long = { ...data, text: "x".repeat(llm.maxInputChars + 1) };
    expect(await resolvePrompt(long, llm, finalize)).toBe(data.fallbackPrompt);
    expect(finalize).not.toHaveBeenCalled();
    const failing = vi.fn(async () => {
      throw new Error("enhance_failed");
    });
    expect(await resolvePrompt(data, llm, failing)).toBe(data.fallbackPrompt);
  });
});

describe("resolveEffectText (spec §14, decision 31)", () => {
  const llm = { url: "https://llm.test", apiKey: "k", model: "m", maxOutputTokens: 800, maxInputChars: 4000, disableThinking: false };
  const effect = (id: "remove_people" | "animate") => ({ id, video: "v1", start: 0, seconds: 5 });
  const images = { frame: "data:frame", photo: "data:photo" };

  it("uses the vision pass when the LLM and the frame are there", async () => {
    const finalize = vi.fn(async () => ({ scene: "Empty ring.", remove: "boxer" }));
    const text = await resolveEffectText({ text: "o boxeador", effect: effect("remove_people") }, llm, images, finalize);
    expect(text).toEqual({ scene: "Empty ring.", remove: "boxer" });
    expect(finalize).toHaveBeenCalledWith(llm, "remove_people", "o boxeador", images);
  });

  it("falls back without the LLM, without the frame it needs, or when the pass fails", async () => {
    const finalize = vi.fn(async () => {
      throw new Error("down");
    });
    const data = { text: "", effect: effect("remove_people") };
    expect(await resolveEffectText(data, null, images, finalize)).toMatchObject({ remove: "person, people" });
    expect(await resolveEffectText(data, llm, { ...images, frame: null }, finalize)).toMatchObject({ remove: "person, people" });
    expect(await resolveEffectText(data, llm, images, finalize)).toMatchObject({ remove: "person, people" });
  });

  it("animate does not need the frame", async () => {
    const finalize = vi.fn(async () => ({ character: "owl", action: "dances" }));
    await resolveEffectText({ text: "", effect: effect("animate") }, llm, { frame: null, photo: "data:photo" }, finalize);
    expect(finalize).toHaveBeenCalled();
  });
});
