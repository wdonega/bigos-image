import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { getConfig } from "@/lib/config";
import { writeLyrics } from "@/lib/enhance";
import { AppError, errorResponse } from "@/lib/errors";
import { MUSIC_GENRE_IDS, type MusicGenreId, genrePhrase } from "@/lib/music";

const bodySchema = z.object({
  prompt: z.string().refine((s) => s.trim().length > 0),
  locale: z.enum(LOCALES),
  genre: z.enum(MUSIC_GENRE_IDS as [MusicGenreId, ...MusicGenreId[]]).nullable().default(null),
});

// "Create lyrics for me" (spec §14, decision 30): song lyrics about the idea, in the user's
// language, with section tags; the screen puts them in the lyrics box to review before generating.
export async function POST(request: Request) {
  try {
    const { llm } = getConfig();
    if (!llm) throw new AppError("enhance_unavailable", 503);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("invalid_request", 400);
    const { prompt, locale, genre } = parsed.data;
    if (prompt.length > llm.maxInputChars) {
      throw new AppError("invalid_request", 400, [{ code: "text_too_long", params: { max: llm.maxInputChars } }]);
    }
    return Response.json({ lyrics: await writeLyrics(llm, prompt, locale, genrePhrase(genre)) });
  } catch (err) {
    return errorResponse(err);
  }
}
