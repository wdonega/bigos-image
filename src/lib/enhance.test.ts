import { describe, expect, it, vi } from "vitest";
import {
  enhancePrompt,
  finalSystemPrompt,
  finalizePrompt,
  imageTokens,
  parseFinalReply,
  parseReply,
  repairTokens,
  styleKeywords,
  systemPrompt,
} from "./enhance";

const llm = { url: "https://llm.test", apiKey: "k", model: "prompt-enhancer", maxOutputTokens: 800, maxInputChars: 4000 };
const reply = (content: string) =>
  Response.json({ choices: [{ message: { content } }] });

describe("enhance helpers", () => {
  it("finds image tokens and repairs bare ones", () => {
    expect(imageTokens("a <image2> and <image1> and <image1>")).toEqual(["<image1>", "<image2>"]);
    expect(repairTokens("cat from image1 on image 2")).toBe("cat from <image1> on <image2>");
    expect(repairTokens("keep <image1> and myimage1")).toBe("keep <image1> and myimage1");
  });

  it("writes in the user's language and mentions image tokens only when present", () => {
    expect(systemPrompt("pt-BR", [])).not.toContain("[Imagem");
    expect(systemPrompt("pt-BR", ["[Imagem 1]", "[Imagem 2]"])).toContain(
      "these exact mentions of input images, brackets included: [Imagem 1], [Imagem 2].",
    );
    expect(systemPrompt("zh-CN", [])).toContain("in Simplified Chinese");
  });

  it("reads plain text, stray quotes and (broken) JSON", () => {
    expect(parseReply("Um gato laranja", [])).toEqual({ text: "Um gato laranja" });
    expect(parseReply('"Um gato laranja"', [])).toEqual({ text: "Um gato laranja" });
    expect(parseReply('{"text":"Um gato laranja"}', [])).toEqual({ text: "Um gato laranja" });
    expect(parseReply('{\n"text: "Um gato laranja"\n}"', [])).toEqual({ text: "Um gato laranja" });
  });

  it("rejects replies that lose or invent image mentions, repairing missing brackets", () => {
    const expected = [1, 2];
    expect(parseReply('{"text":"gato da [Imagem 1]"}', expected)).toBeNull();
    expect(parseReply('{"text":"gato da Imagem 1 no sofá da [Imagem 2]"}', expected)).toEqual({
      text: "gato da [Imagem 1] no sofá da [Imagem 2]",
    });
    expect(parseReply('{"text":"[Imagem 3] gato"}', [])).toBeNull();
  });

  it("rejects empty replies", () => {
    expect(parseReply("  ", [])).toBeNull();
    expect(parseReply('{"text":""}', [])).toBeNull();
  });
});

describe("enhancePrompt", () => {
  it("calls the OpenAI-compatible endpoint with the configured model", async () => {
    const fetchMock = vi.fn(async () => reply("Um gato detalhado"));
    const out = await enhancePrompt(llm, "um gato", "pt-BR", fetchMock as unknown as typeof fetch);
    expect(out).toEqual({ text: "Um gato detalhado" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "prompt-enhancer", max_tokens: 800 });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("retries when a mention is lost, then fails with a code", async () => {
    const bad = vi.fn(async () => reply("um gato sem a menção"));
    await expect(
      enhancePrompt(llm, "o gato da [Imagem 1]", "pt-BR", bad as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "enhance_failed" });
    expect(bad).toHaveBeenCalledTimes(3);
  });

  it("maps network errors to enhance_unavailable", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(enhancePrompt(llm, "x", "pt-BR", down as unknown as typeof fetch)).rejects.toMatchObject({
      code: "enhance_unavailable",
    });
  });
});

describe("final pass", () => {
  const watercolor = "watercolor painting, soft washes, paper texture";

  it("asks for a faithful translation, references and the style up front", () => {
    const withAll = finalSystemPrompt(2, watercolor);
    expect(withAll).toContain("add nothing new");
    expect(withAll).toContain("<image1>");
    expect(withAll).toContain(`Art style: ${watercolor}. Begin with "Turn <image1> into"`);
    expect(withAll).toContain("receives 2 input image(s)");
    expect(finalSystemPrompt(0, watercolor)).toContain('"A watercolor painting of…"');
    expect(finalSystemPrompt(0, null)).not.toMatch(/<image1>|art style/i);
  });

  it("takes style keywords from the first phrase", () => {
    expect(styleKeywords(watercolor)).toEqual(["watercolor"]);
    expect(styleKeywords("low poly 3D, faceted geometry")).toEqual(["poly"]);
  });

  it("accepts a reply that keeps the references and mentions the style", () => {
    expect(parseFinalReply('{"en":"Watercolor painting of the cat from image1"}', ["<image1>"], 1, watercolor)).toBe(
      "Watercolor painting of the cat from <image1>",
    );
    expect(parseFinalReply('{"en":"A cat"}', [], 0, null)).toBe("A cat");
    // Edit screen without a written mention: "Turn <image1> into…" is allowed.
    expect(
      parseFinalReply('{"en":"Turn <image1> into a watercolor painting. Replace the background"}', [], 1, watercolor),
    ).toBe("Turn <image1> into a watercolor painting. Replace the background");
  });

  it("rejects replies that lose the style or change the references", () => {
    expect(parseFinalReply('{"en":"A cat from <image1>"}', ["<image1>"], 1, watercolor)).toBeNull();
    // Style only at the end: rejected.
    const tail = `A cat from <image1> sitting on a sofa by a big window with plants, soft morning light, cozy room, wooden floor, watercolor painting`;
    expect(parseFinalReply(JSON.stringify({ en: tail }), ["<image1>"], 1, watercolor)).toBeNull();
    expect(parseFinalReply('{"en":"Watercolor cat"}', ["<image1>"], 1, watercolor)).toBeNull();
    expect(parseFinalReply('{"en":"Watercolor cat <image1> <image2>"}', ["<image1>"], 1, watercolor)).toBeNull();
    expect(parseFinalReply('{"en":"Watercolor cat <image1>"}', [], 0, watercolor)).toBeNull();
    expect(parseFinalReply("nope", [], 0, null)).toBeNull();
  });

  it("returns the English prompt from the LLM", async () => {
    const fetchMock = vi.fn(async () => reply('{"en":"Watercolor painting of a cat on <image1>"}'));
    const out = await finalizePrompt(llm, "um gato na <image1>", watercolor, 1, fetchMock as unknown as typeof fetch);
    expect(out).toBe("Watercolor painting of a cat on <image1>");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[1]).toEqual({ role: "user", content: "um gato na <image1>" });
  });
});
