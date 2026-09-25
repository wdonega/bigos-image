import { describe, expect, it } from "vitest";
import { mentionLabel, mentionsToTokens, renumberMentions, tokensToMentions } from "./mentions";

describe("mentions", () => {
  it("converts Portuguese and English mentions into the model's <imageN> syntax", () => {
    expect(mentionsToTokens("o gato da [Imagem 1] no sofá da [ imagem 2 ]")).toBe(
      "o gato da <image1> no sofá da <image2>",
    );
    expect(mentionsToTokens("the cat from [Image 1] on [image 2]")).toBe("the cat from <image1> on <image2>");
  });

  it("converts Spanish and Chinese mentions too", () => {
    expect(mentionsToTokens("el gato de la [Imagen 1]")).toBe("el gato de la <image1>");
    expect(mentionsToTokens("[图片 1] 里的猫坐在 [图片2] 上")).toBe("<image1> 里的猫坐在 <image2> 上");
  });

  it("leaves plain prose and typed tokens alone", () => {
    expect(mentionsToTokens("a imagem 2 é bonita, use <image3>")).toBe("a imagem 2 é bonita, use <image3>");
  });

  it("renumbers after reordering and marks removed images", () => {
    // Old order 1,2,3 → new order 3,1 (image 2 removed).
    expect(renumberMentions("[Imagem 1] com [Imagem 2] e [Imagem 3]", [3, 1], "Imagem", "[Imagem removida]")).toBe(
      "[Imagem 2] com [Imagem removida] e [Imagem 1]",
    );
    expect(renumberMentions("[Image 2] and [Image 1]", [2, 1], "Image", "[Image removed]")).toBe(
      "[Image 1] and [Image 2]",
    );
  });

  it("builds labels in the given language", () => {
    expect(mentionLabel(4, "Imagem")).toBe("[Imagem 4]");
    expect(mentionLabel(4, "Image")).toBe("[Image 4]");
  });
});

describe("tokensToMentions", () => {
  it("shows <imageN> tokens as localized labels and round-trips", () => {
    const shown = tokensToMentions("gato da <image1> no sofá da <image2>", "Imagem");
    expect(shown).toBe("gato da [Imagem 1] no sofá da [Imagem 2]");
    expect(mentionsToTokens(shown)).toBe("gato da <image1> no sofá da <image2>");
  });
});
