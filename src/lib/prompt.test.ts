import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("keeps the prompt exactly as typed without transparency", () => {
    expect(buildPrompt("  uma maçã.  ", false)).toBe("  uma maçã.  ");
  });

  it("wraps the prompt for a transparent background (spec §8.2)", () => {
    expect(buildPrompt("uma maçã vermelha.", true)).toBe(
      "This is an RGBA format image with transparency. uma maçã vermelha. The image has an alpha channel and a transparent background.",
    );
  });
});
