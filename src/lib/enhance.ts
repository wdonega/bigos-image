import type { LlmConfig } from "./config.ts";
import { AppError } from "./errors.ts";

// "Improve text": a small LLM behind LiteLLM (OpenAI-compatible API) rewrites the user's idea as
// a detailed English prompt, plus a summary in the user's language so lay users can review it.
// The model has a tiny context (512 input / 300 output tokens), so the instructions stay short.

export type EnhanceResult = { english: string; summary: string };

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-BR": "Brazilian Portuguese",
  "en-US": "English",
  "es-MX": "Mexican Spanish",
  "zh-CN": "Simplified Chinese",
};

const TOKEN = /<image(\d{1,2})>/g;
const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 30_000;

/** Distinct image tokens (<image1>, <image2>…) in a text, sorted. */
export function imageTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((m) => `<image${Number(m[1])}>`))].sort();
}

/** Small models sometimes drop the brackets ("image1"): put them back. */
export function repairTokens(text: string): string {
  return text.replace(/(?<![<\w])image\s?(\d{1,2})(?![\w>])/gi, (_m, n: string) => `<image${Number(n)}>`);
}

export function systemPrompt(locale: string, hasImages: boolean): string {
  const language = LANGUAGE_NAMES[locale] ?? "English";
  return [
    "You improve prompts for an image generator.",
    "Rewrite the user idea as ONE detailed English prompt (subject, setting, lighting, composition; max 60 words). Do not add an art style.",
    hasImages
      ? "The idea refers to input images as <image1>, <image2>: every one of them MUST appear in both outputs, unchanged."
      : "",
    `Reply ONLY with JSON: {"en":"<english prompt>","summary":"<same prompt in ${language}, max 35 words>"}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Parses the model's reply; null when it is not usable (bad JSON, empty, lost image tokens). */
export function parseReply(content: string, expected: string[]): EnhanceResult | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const { en, summary } = (data ?? {}) as { en?: unknown; summary?: unknown };
  if (typeof en !== "string" || typeof summary !== "string" || !en.trim() || !summary.trim()) return null;
  const english = repairTokens(en.trim());
  const localized = repairTokens(summary.trim());
  const keepsTokens = (text: string) => expected.every((t) => text.includes(t));
  if (!keepsTokens(english) || !keepsTokens(localized)) return null;
  // Tokens the user never wrote would point the model at the wrong images.
  if (imageTokens(english).some((t) => !expected.includes(t))) return null;
  return { english, summary: localized };
}

type ChatMessage = { role: "system" | "user"; content: string };

/**
 * One chat completion, parsed by `parse`; an unusable reply is retried once. Network/HTTP failures
 * → enhance_unavailable; two unusable replies → enhance_failed.
 */
async function complete<T>(
  llm: LlmConfig,
  messages: ChatMessage[],
  parse: (content: string) => T | null,
  fetchImpl: typeof fetch,
): Promise<T> {
  const body = JSON.stringify({ model: llm.model, temperature: 0.3, max_tokens: 300, messages });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${llm.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${llm.apiKey}` },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      console.error("[enhance] LLM unreachable", err);
      throw new AppError("enhance_unavailable", 503);
    }
    if (!res.ok) {
      console.error(`[enhance] LLM HTTP ${res.status}`, await res.text().catch(() => ""));
      throw new AppError("enhance_unavailable", 503);
    }
    const reply = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const parsed = parse(reply?.choices?.[0]?.message?.content ?? "");
    if (parsed) return parsed;
    console.warn(`[enhance] unusable reply (attempt ${attempt + 1})`);
  }
  throw new AppError("enhance_failed", 502);
}

/** "Improve text" (button): `prompt` must already carry <imageN> tokens (see mentions.ts). */
export function enhancePrompt(
  llm: LlmConfig,
  prompt: string,
  locale: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EnhanceResult> {
  const expected = imageTokens(prompt);
  return complete(
    llm,
    [
      { role: "system", content: systemPrompt(locale, expected.length > 0) },
      { role: "user", content: prompt },
    ],
    (content) => parseReply(content, expected),
    fetchImpl,
  );
}

// Final pass, run by the worker on every generation (spec §14, decision 24): the text goes to the
// generator in English, with image references as <imageN>, and the chosen style woven in up front
// (a style phrase appended at the end barely changes the result).

export function finalSystemPrompt(imageCount: number, style: string | null): string {
  const images = imageCount > 0;
  return [
    "You prepare prompts for an image generator.",
    "Translate the user text to English, faithfully: keep its meaning and details, add nothing new, remove nothing. Keep edit instructions as instructions (e.g. \"Replace the background with a beach\").",
    images
      ? `The generator receives ${imageCount} input image(s), written <image1>${imageCount > 1 ? ", <image2>" : ""}: keep every such reference in the text exactly, in the right place.`
      : "",
    style && images
      ? `Art style: ${style}. Begin with "Turn <image1> into" followed by that style, so the whole image changes style, then the rest of the text.`
      : "",
    style && !images ? `Art style: ${style}. Begin the prompt with that style (for example "A ${style.split(",")[0]} of…").` : "",
    'Reply ONLY with JSON: {"en":"<english prompt>"}',
  ]
    .filter(Boolean)
    .join(" ");
}

/** Words that show the style made it into the final prompt (from its first phrase, e.g. "low poly 3D"). */
export function styleKeywords(style: string): string[] {
  return (style.split(",")[0] ?? "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 4 && !["style", "with", "painting", "art"].includes(w));
}

/** `expected`: references the user wrote (must survive); `imageCount`: images the job really has. */
export function parseFinalReply(
  content: string,
  expected: string[],
  imageCount: number,
  style: string | null,
): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let en: unknown;
  try {
    en = (JSON.parse(content.slice(start, end + 1)) as { en?: unknown } | null)?.en;
  } catch {
    return null;
  }
  if (typeof en !== "string" || !en.trim()) return null;
  const english = repairTokens(en.trim());
  const tokens = imageTokens(english);
  if (expected.some((t) => !tokens.includes(t))) return null;
  // "Turn <image1> into…" may add <image1>; a reference to an image the job does not have may not.
  if (tokens.some((t) => Number(t.slice(6, -1)) > imageCount)) return null;
  if (style) {
    const words = styleKeywords(style);
    const lower = english.toLowerCase();
    if (words.length > 0 && !words.some((w) => lower.includes(w))) return null;
  }
  return english;
}

/** `text` carries <imageN> tokens; `style` is the style's English phrase (styles.ts) or null. */
export function finalizePrompt(
  llm: LlmConfig,
  text: string,
  style: string | null,
  imageCount: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const expected = imageTokens(text);
  return complete(
    llm,
    [
      { role: "system", content: finalSystemPrompt(imageCount, style) },
      { role: "user", content: text },
    ],
    (content) => parseFinalReply(content, expected, imageCount, style),
    fetchImpl,
  );
}
