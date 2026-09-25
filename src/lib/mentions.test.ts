import { describe, expect, it } from "vitest";
import { mentionLabel, mentionsToTokens, renumberMentions } from "./mentions";

describe("mentions", () => {
  it("converts [Imagem N] into the model's <imageN> syntax", () => {
    expect(mentionsToTokens("o gato da [Imagem 1] no sofá da [ imagem 2 ]")).toBe(
      "o gato da <image1> no sofá da <image2>",
    );
  });

  it("leaves plain prose and typed tokens alone", () => {
    expect(mentionsToTokens("a imagem 2 é bonita, use <image3>")).toBe("a imagem 2 é bonita, use <image3>");
  });

  it("renumbers after reordering and marks removed images", () => {
    // Old order 1,2,3 → new order 3,1 (image 2 removed).
    expect(renumberMentions("[Imagem 1] com [Imagem 2] e [Imagem 3]", [3, 1])).toBe(
      "[Imagem 2] com [Imagem removida] e [Imagem 1]",
    );
  });

  it("builds labels", () => {
    expect(mentionLabel(4)).toBe("[Imagem 4]");
  });
});
