import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { getConfig } from "@/lib/config";
import { enhancePrompt } from "@/lib/enhance";
import { AppError, errorResponse } from "@/lib/errors";

const bodySchema = z.object({
  prompt: z.string().refine((s) => s.trim().length > 0),
  locale: z.enum(LOCALES),
  kind: z.enum(["image", "video"]).default("image"),
});

// "Improve text": returns the idea rewritten in more detail, in the user's language.
// Image mentions stay as the user wrote them ("[Imagem 1]"); the reply is checked to keep them all.
export async function POST(request: Request) {
  try {
    const { llm } = getConfig();
    if (!llm) throw new AppError("enhance_unavailable", 503);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("invalid_request", 400);
    const { prompt, locale, kind } = parsed.data;
    if (prompt.length > llm.maxInputChars) {
      throw new AppError("invalid_request", 400, [{ code: "text_too_long", params: { max: llm.maxInputChars } }]);
    }
    return Response.json(await enhancePrompt(llm, prompt, locale, fetch, kind));
  } catch (err) {
    return errorResponse(err);
  }
}
