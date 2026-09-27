import type { LlmConfig } from "./config.ts";
import { AppError } from "./errors.ts";
import { mentionNumbers, repairMentions } from "./mentions.ts";

// "Improve text": a small LLM behind LiteLLM (OpenAI-compatible API) rewrites the user's idea as a
// more detailed prompt, in the user's own language, straight into the text field (translation to
// English happens later, in the final pass of every generation). Token limits come from the
// config (LLM_MAX_OUTPUT_TOKENS); the instructions stay short for a small model.

export type EnhanceResult = { text: string };

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-BR": "Brazilian Portuguese",
  "en-US": "English",
  "es-MX": "Mexican Spanish",
  "zh-CN": "Simplified Chinese",
};

const TOKEN = /<image(\d{1,2})>/g;
/** An image mention as shown on screen, in any language ("[Imagem 1]", "[图片 2]"). */
const MENTION_LABEL = /\[\s*(?:imagem|imagen|image|图片)\s*\d{1,2}\s*\]/giu;

/** How far into the final prompt the style must appear. */
const STYLE_HEAD_CHARS = 100;

/** Tries per request: the final pass has a fallback; "Improve text" has none, so it tries more. */
const FINAL_ATTEMPTS = 2;
const ENHANCE_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

/** Distinct image tokens (<image1>, <image2>…) in a text, sorted. */
export function imageTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((m) => `<image${Number(m[1])}>`))].sort();
}

/** Small models sometimes drop the brackets ("image1"): put them back. */
export function repairTokens(text: string): string {
  return text.replace(/(?<![<\w])image\s?(\d{1,2})(?![\w>])/gi, (_m, n: string) => `<image${Number(n)}>`);
}

/** `mentions`: the image mentions exactly as the user wrote them ("[Imagem 1]"), listed so a small model keeps them. */
/** What "Improve text" details: a still image, or a video (which also has motion and sound). */
export type EnhanceKind = "image" | "video" | "music";

const DETAILS: Record<EnhanceKind, string> = {
  image: "subject, setting, lighting, composition",
  video: "subject, action over time, camera movement, setting, lighting, sounds",
  music: "genre, mood, tempo, instruments, voice, how the song unfolds",
};
const GENERATOR: Record<EnhanceKind, string> = { image: "an image", video: "a video", music: "a music" };

export function systemPrompt(locale: string, mentions: string[], kind: EnhanceKind = "image"): string {
  const language = LANGUAGE_NAMES[locale] ?? "English";
  return [
    `You improve prompts for ${GENERATOR[kind]} generator.`,
    `Rewrite the user idea as ONE more detailed prompt in ${language} (${DETAILS[kind]}). Maximum ${kind === "image" ? 60 : 80} words. Keep the user's intent; do not add an art style.`,
    mentions.length > 0
      ? `The prompt MUST contain these exact mentions of input images, brackets included: ${mentions.join(", ")}.`
      : "",
    // Plain text, not JSON: the small model often breaks JSON quoting.
    "Reply with the improved prompt only: no quotes, no title, no explanation.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The model's text: plain, or {"text": …} if it answered in JSON anyway; wrapping quotes removed. */
function replyText(content: string): string {
  let text = content.trim();
  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as { text?: unknown };
      if (typeof data.text === "string") text = data.text;
    } catch {
      text = text.replace(/^\{\s*"?text"?\s*:\s*/u, "").replace(/\s*\}\s*"?$/u, "");
    }
  }
  return text.replace(/^["“”']+|["“”']+$/gu, "").trim();
}

/**
 * Parses the model's reply; null when it is not usable (empty, a mentioned image lost or one
 * invented). `expected`: the image numbers the user mentioned.
 */
export function parseReply(content: string, expected: number[]): EnhanceResult | null {
  const text = replyText(content);
  if (!text) return null;
  const improved = repairMentions(text);
  if (mentionNumbers(improved).join() !== expected.join()) return null;
  return { text: improved };
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
  attempts: number,
): Promise<T> {
  const body = JSON.stringify({ model: llm.model, temperature: 0.3, max_tokens: llm.maxOutputTokens, messages });
  for (let attempt = 0; attempt < attempts; attempt++) {
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

/** "Improve text" (button): `prompt` is the user's text, image mentions as on screen ("[Imagem 1]"). */
export function enhancePrompt(
  llm: LlmConfig,
  prompt: string,
  locale: string,
  fetchImpl: typeof fetch = fetch,
  kind: EnhanceKind = "image",
): Promise<EnhanceResult> {
  const expected = mentionNumbers(prompt);
  const mentions = [...new Set(prompt.match(MENTION_LABEL) ?? [])];
  return complete(
    llm,
    [
      { role: "system", content: systemPrompt(locale, mentions, kind) },
      { role: "user", content: prompt },
    ],
    (content) => parseReply(content, expected),
    fetchImpl,
    ENHANCE_ATTEMPTS,
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
    // The style must lead the prompt: at the end it barely changes the image (spec §14, decision 24).
    const words = styleKeywords(style);
    const head = english.slice(0, STYLE_HEAD_CHARS).toLowerCase();
    if (words.length > 0 && !words.some((w) => head.includes(w))) return null;
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
    FINAL_ATTEMPTS,
  );
}

// Final pass for video (spec §14, decision 28): besides the English description, H3 writes the
// soundtrack itself, so the pass also derives the sounds (and music, only if asked) from the text.
// Plain labeled lines, not JSON: the small model breaks JSON quoting.

export type VideoPromptText = { description: string; soundscape: string; music: string };

export function finalVideoSystemPrompt(imageCount: number, style: string | null): string {
  const images = imageCount > 0;
  return [
    "You prepare prompts for a video generator that also creates the soundtrack.",
    "Translate the user idea to English, faithfully: keep its meaning and details, add nothing new.",
    images
      ? `The idea refers to ${imageCount} input image(s) as <image1>${imageCount > 1 ? ", <image2>" : ""}: keep every such reference exactly, in the right place.`
      : "",
    style ? `Art style: ${style}. Begin DESCRIPTION with that style.` : "",
    "Reply with exactly three lines:",
    "DESCRIPTION: <what happens in the video, in English>",
    "SOUND: <the sounds this scene makes: ambience, effects, voices if any; NONE if the user asked for silence>",
    "MUSIC: <background music only if the user asked for music, else N/A>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reads the three labeled lines; null when the description is missing or loses/invents references or the style. */
export function parseVideoReply(
  content: string,
  expected: string[],
  imageCount: number,
  style: string | null,
): VideoPromptText | null {
  const field = (label: string) => {
    // Labels may come bold ("**SOUND:**"); a field runs until the next label or the end.
    const match = content.match(
      new RegExp(`^\\s*\\**${label}\\**\\s*:\\**\\s*([\\s\\S]*?)(?=^\\s*\\**(?:DESCRIPTION|SOUND|MUSIC)\\**\\s*:|$(?![\\s\\S]))`, "im"),
    );
    return match ? match[1].trim() : "";
  };
  const description = repairTokens(field("DESCRIPTION"));
  if (!description) return null;
  const tokens = imageTokens(description);
  if (expected.some((t) => !tokens.includes(t))) return null;
  if (tokens.some((t) => Number(t.slice(6, -1)) > imageCount)) return null;
  if (style) {
    const words = styleKeywords(style);
    const head = description.slice(0, STYLE_HEAD_CHARS).toLowerCase();
    if (words.length > 0 && !words.some((w) => head.includes(w))) return null;
  }
  // The model sometimes tacks the "NONE" option onto a real list ("waves, wind; NONE").
  const sound = field("SOUND").replace(/[;,]\s*none\.?$/i, "").trim();
  const music = field("MUSIC");
  return {
    description,
    // NONE: the user asked for silence, which the guide writes as N/A.
    soundscape: /^none\.?$/i.test(sound) ? "N/A" : sound,
    music: /^(n\/a|none)\.?$/i.test(music) ? "" : music,
  };
}

/** `text` carries <imageN> tokens; `style` is the style's English phrase or null. */
export function finalizeVideoPrompt(
  llm: LlmConfig,
  text: string,
  style: string | null,
  imageCount: number,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoPromptText> {
  const expected = imageTokens(text);
  return complete(
    llm,
    [
      { role: "system", content: finalVideoSystemPrompt(imageCount, style) },
      { role: "user", content: text },
    ],
    (content) => parseVideoReply(content, expected, imageCount, style),
    fetchImpl,
    FINAL_ATTEMPTS,
  );
}

// Music (spec §14, decision 30): the final pass turns the user's description (+ genre) into the
// caption layout MiniMax Music 3 was trained on; the lyrics are never translated. Labeled lines,
// not JSON, like video.

export type MusicCaptionText = { global: string; vocals: string; arrangement: string };

export function finalMusicSystemPrompt(genre: string | null, instrumental: boolean): string {
  return [
    "You write the description of a song for a music generator, in English, from the user's idea (any language).",
    "Keep the user's intent; fill in plausible musical details (tempo in BPM, key, instruments) that fit it.",
    genre ? `Genre: ${genre}. Start GLOBAL with it.` : "",
    instrumental ? "The piece is instrumental: VOCALS must be NONE." : "",
    "Reply with exactly three lines:",
    "GLOBAL: <genre, tempo, key, mood, where it would be heard, production texture>",
    `VOCALS: <voice type, delivery and effects${instrumental ? "" : "; NONE only if the idea asks for no vocals"}>`,
    "ARRANGEMENT: <instruments, then how it unfolds: intro, verses, chorus, bridge, outro>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseMusicReply(content: string, genre: string | null, instrumental: boolean): MusicCaptionText | null {
  const field = (label: string) => {
    const match = content.match(
      new RegExp(`^\\s*\\**${label}\\**\\s*:\\**\\s*([\\s\\S]*?)(?=^\\s*\\**(?:GLOBAL|VOCALS|ARRANGEMENT)\\**\\s*:|$(?![\\s\\S]))`, "im"),
    );
    return match ? match[1].trim() : "";
  };
  const global = field("GLOBAL");
  const arrangement = field("ARRANGEMENT");
  if (!global || !arrangement) return null;
  if (genre) {
    const words = styleKeywords(genre);
    const head = global.slice(0, STYLE_HEAD_CHARS).toLowerCase();
    if (words.length > 0 && !words.some((w) => head.includes(w))) return null;
  }
  const vocals = field("VOCALS");
  return { global, vocals: instrumental || /^none\.?$/i.test(vocals) ? "" : vocals, arrangement };
}

/** `genre` is the genre's English phrase (music.ts) or null. */
export function finalizeMusicCaption(
  llm: LlmConfig,
  description: string,
  genre: string | null,
  instrumental: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<MusicCaptionText> {
  return complete(
    llm,
    [
      { role: "system", content: finalMusicSystemPrompt(genre, instrumental) },
      { role: "user", content: description },
    ],
    (content) => parseMusicReply(content, genre, instrumental),
    fetchImpl,
    FINAL_ATTEMPTS,
  );
}

// "Create lyrics for me" (spec §14, decision 30): short song lyrics in the user's language, with the
// section tags the model expects; shown in the lyrics box for the user to review before generating.

const LYRICS_TAG = /^\s*\[(intro|verse|pre-chorus|chorus|bridge|outro|instrumental)[^\]]*\]\s*$/gim;

export function lyricsSystemPrompt(locale: string, genre: string | null): string {
  const language = LANGUAGE_NAMES[locale] ?? "English";
  return [
    `You write song lyrics in ${language} for a music generator.`,
    genre ? `Genre: ${genre}.` : "",
    "Write short, singable lyrics about the user's idea: two verses and a chorus that repeats, optionally a bridge.",
    "Put each section under its own tag on a separate line: [Intro], [Verse], [Chorus], [Bridge], [Outro].",
    "Reply with the lyrics only: no title, no explanation.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The lyrics with at least one verse or chorus tag and some sung lines; null otherwise. */
export function parseLyricsReply(content: string): string | null {
  const text = content.trim().replace(/^```[a-z]*\n?|```$/g, "").trim();
  const tags = text.match(LYRICS_TAG) ?? [];
  if (!tags.some((t) => /verse|chorus/i.test(t))) return null;
  const sung = text.split("\n").filter((l) => l.trim() && !/^\s*\[[^\]]*\]\s*$/.test(l));
  return sung.length >= 4 ? text : null;
}

export function writeLyrics(
  llm: LlmConfig,
  idea: string,
  locale: string,
  genre: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return complete(
    llm,
    [
      { role: "system", content: lyricsSystemPrompt(locale, genre) },
      { role: "user", content: idea },
    ],
    parseLyricsReply,
    fetchImpl,
    ENHANCE_ATTEMPTS,
  );
}
