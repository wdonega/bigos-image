// Music (spec §14, decision 30): MiniMax Music 3 through ComfyUI. Pure helpers: the options on
// screen, the genres (an English phrase each, for the model), the lyrics rules and the caption in
// the model's own layout (Global Metadata / Vocal Details / Arrangement, as in the workflow).

/** Longest song offered; the model may end earlier (`max_duration`). */
export const MUSIC_DURATIONS = [30, 60, 120, 180] as const;
export type MusicDuration = (typeof MUSIC_DURATIONS)[number];

export const MUSIC_GENRES = [
  { id: "pop", phrase: "modern pop" },
  { id: "rock", phrase: "rock with electric guitars" },
  { id: "samba", phrase: "Brazilian samba" },
  { id: "mpb", phrase: "MPB, Brazilian popular music" },
  { id: "bossa-nova", phrase: "bossa nova" },
  { id: "sertanejo", phrase: "Brazilian sertanejo" },
  { id: "forro", phrase: "Brazilian forró with accordion" },
  { id: "funk", phrase: "Brazilian funk carioca" },
  { id: "electronic", phrase: "electronic dance music" },
  { id: "hip-hop", phrase: "hip-hop" },
  { id: "lofi", phrase: "lo-fi hip-hop, chillhop" },
  { id: "reggae", phrase: "reggae" },
  { id: "jazz", phrase: "jazz" },
  { id: "classical", phrase: "orchestral classical music" },
  { id: "kids", phrase: "cheerful children's song" },
] as const;
export type MusicGenreId = (typeof MUSIC_GENRES)[number]["id"];
export const MUSIC_GENRE_IDS = MUSIC_GENRES.map((g) => g.id) as MusicGenreId[];

export function genrePhrase(id: MusicGenreId | null): string | null {
  return id ? (MUSIC_GENRES.find((g) => g.id === id)?.phrase ?? null) : null;
}

/** What the model receives as lyrics for an instrumental piece (decided by the m6 spike). */
export const INSTRUMENTAL_LYRICS = "[Instrumental]";

const SECTION_TAG = /^\s*\[[^\]\n]+\]\s*$/m;

/**
 * Lyrics as sung: the user's text untouched (never translated), with a [Verse] tag in front when
 * it has no section tags at all — the model expects [Intro]/[Verse]/[Chorus]… (spec §14, decision 30).
 */
export function normalizeLyrics(lyrics: string, instrumental: boolean): string {
  if (instrumental) return INSTRUMENTAL_LYRICS;
  const text = lyrics.trim();
  if (!text) return INSTRUMENTAL_LYRICS;
  return SECTION_TAG.test(text) ? text : `[Verse]\n${text}`;
}

export type MusicCaptionParts = {
  /** Genre, tempo, key, mood and production, in English. */
  global: string;
  /** How the voice sounds; empty for instrumental pieces. */
  vocals: string;
  /** Instruments and how the song unfolds. */
  arrangement: string;
};

/** The caption in the workflow's layout; sections only when they have content. */
export function buildMusicCaption({ global, vocals, arrangement }: MusicCaptionParts): string {
  const sections = [`Global Metadata: ${global.trim()}`];
  if (vocals.trim()) sections.push(`Vocal Details: ${vocals.trim()}`);
  if (arrangement.trim()) sections.push(`Arrangement: ${arrangement.trim()}`);
  return sections.join("\n\n");
}

/** Without the LLM: the description as written, the genre first, no vocals when instrumental. */
export function fallbackMusicCaption(description: string, genre: MusicGenreId | null, instrumental: boolean): string {
  const phrase = genrePhrase(genre);
  const global = [phrase, description.trim().replace(/[.\s]+$/u, "")].filter(Boolean).join(". ") + ".";
  return buildMusicCaption({
    global,
    vocals: "",
    arrangement: instrumental ? "Instrumental piece, no vocals." : "",
  });
}
