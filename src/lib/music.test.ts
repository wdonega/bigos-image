import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages";
import { LOCALES } from "../i18n/config";
import {
  INSTRUMENTAL_LYRICS,
  MUSIC_GENRES,
  buildMusicCaption,
  fallbackMusicCaption,
  genrePhrase,
  normalizeLyrics,
} from "./music";

describe("normalizeLyrics", () => {
  it("keeps tagged lyrics exactly as written", () => {
    const lyrics = "[Verse]\nChegou o sábado\n\n[Chorus]\nÔ, ô, ô";
    expect(normalizeLyrics(`  ${lyrics}\n`, false)).toBe(lyrics);
  });

  it("puts a [Verse] tag in front of untagged lyrics", () => {
    expect(normalizeLyrics("linha um\nlinha dois", false)).toBe("[Verse]\nlinha um\nlinha dois");
  });

  it("instrumental, or no lyrics at all, sends the instrumental marker", () => {
    expect(normalizeLyrics("some text", true)).toBe(INSTRUMENTAL_LYRICS);
    expect(normalizeLyrics("   ", false)).toBe(INSTRUMENTAL_LYRICS);
  });
});

describe("music caption", () => {
  it("writes the workflow's sections, skipping empty ones", () => {
    expect(buildMusicCaption({ global: "Samba, 100 BPM.", vocals: "", arrangement: "Cavaquinho." })).toBe(
      "Global Metadata: Samba, 100 BPM.\n\nArrangement: Cavaquinho.",
    );
    expect(buildMusicCaption({ global: "Pop.", vocals: "Female lead.", arrangement: "" })).toBe(
      "Global Metadata: Pop.\n\nVocal Details: Female lead.",
    );
  });

  it("fallback: genre first, the text as written, no vocals when instrumental", () => {
    expect(fallbackMusicCaption("uma música animada.", "samba", true)).toBe(
      "Global Metadata: Brazilian samba. uma música animada.\n\nArrangement: Instrumental piece, no vocals.",
    );
    expect(fallbackMusicCaption("calm piano", null, false)).toBe("Global Metadata: calm piano.");
    expect(genrePhrase(null)).toBeNull();
  });

  it.each(LOCALES)("every genre has a name in %s", (locale) => {
    const m = MESSAGES[locale] as unknown as { musicGenres: Record<string, string> };
    for (const g of MUSIC_GENRES) expect(m.musicGenres[g.id], g.id).toBeTruthy();
  });
});
