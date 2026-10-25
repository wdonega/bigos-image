import { describe, expect, it } from "vitest";
import { EFFECTS, EFFECT_IDS, animateSize, characterPrompt, fallbackEffectText, loadSize } from "./effects";

describe("EFFECTS", () => {
  it("maps each effect to its graph, photo and consent rule", () => {
    expect(EFFECT_IDS.map((id) => [id, EFFECTS[id].workflow, EFFECTS[id].photo, EFFECTS[id].consent])).toEqual([
      ["remove_people", "fx_clean_plate", null, false],
      ["face_swap", "fx_face_swap", "face", true],
      ["animate", "fx_animate", "character", true],
      ["character_swap", "fx_character_swap", "character", true],
    ]);
  });
});

describe("fallbackEffectText", () => {
  it("removes people by default and adds what the user asked to remove", () => {
    expect(fallbackEffectText("remove_people", "")).toMatchObject({ remove: "person, people" });
    expect(fallbackEffectText("remove_people", " o carro ")).toMatchObject({ remove: "person, people, o carro" });
    expect(fallbackEffectText("remove_people", "").scene).toMatch(/No people/);
  });

  it("keeps the scene for the face swap and appends the user's notes", () => {
    const text = fallbackEffectText("face_swap", "sorrindo");
    expect(text.scene).toMatch(/same scene/);
    expect(text.scene?.endsWith("sorrindo")).toBe(true);
  });

  it("uses the user's action for animate, or follows the motion video", () => {
    expect(fallbackEffectText("animate", "dança")).toMatchObject({ action: "dança" });
    expect(fallbackEffectText("animate", "").action).toMatch(/motion video/);
  });

  it("gives the detector English only: other text falls back to person", () => {
    expect(fallbackEffectText("character_swap", "")).toEqual({ subject: "person" });
    expect(fallbackEffectText("character_swap", "the man on the left")).toEqual({ subject: "the man on the left" });
    expect(fallbackEffectText("character_swap", "o homem à esquerda")).toEqual({ subject: "person" });
  });
});

describe("characterPrompt", () => {
  it("follows the template's wording", () => {
    expect(characterPrompt("an owl")).toBe("Character appearance description: an owl");
  });
});

describe("animateSize", () => {
  const pixels = 482 * 854;

  it("keeps the template's portrait size for portrait videos", () => {
    expect(animateSize({ width: 1080, height: 1920 }, pixels)).toEqual({ width: 480, height: 848 });
  });

  it("turns it landscape for landscape videos, same pixel budget", () => {
    const size = animateSize({ width: 1280, height: 736 }, pixels);
    expect(size.width).toBeGreaterThan(size.height);
    expect(size.width % 16).toBe(0);
    expect(size.height % 16).toBe(0);
    expect(size.width * size.height).toBeLessThanOrEqual(pixels);
  });

  it("falls back to portrait when the size is unknown", () => {
    const size = animateSize({ width: 0, height: 0 }, pixels);
    expect(size.height).toBeGreaterThan(size.width);
  });
});

describe("loadSize", () => {
  it("keeps videos within the limit (0 × 0 = original)", () => {
    expect(loadSize({ width: 1280, height: 736 }, 1280)).toEqual({ width: 0, height: 0 });
  });

  it("scales bigger videos down to the limit, multiples of 8", () => {
    expect(loadSize({ width: 2160, height: 3840 }, 1280)).toEqual({ width: 720, height: 1280 });
  });
});
