import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { getConfig } from "@/lib/config";
import { enhancePrompt } from "@/lib/enhance";
import { AppError, errorResponse } from "@/lib/errors";

const bodySchema = z.object({
  // Short on purpose: the enhancer model reads at most 512 tokens (spec §14).
  prompt: z
    .string()
    .max(1000)
    .refine((s) => s.trim().length > 0),
  locale: z.enum(LOCALES),
});

// "Improve text": returns the idea rewritten in more detail, in the user's language.
// Image mentions stay as the user wrote them ("[Imagem 1]"); the reply is checked to keep them all.
export async function POST(request: Request) {
  try {
    const { llm } = getConfig();
    if (!llm) throw new AppError("enhance_unavailable", 503);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("invalid_request", 400);
    const { prompt, locale } = parsed.data;
    return Response.json(await enhancePrompt(llm, prompt, locale));
  } catch (err) {
    return errorResponse(err);
  }
}
