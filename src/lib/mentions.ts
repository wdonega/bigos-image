// Image mentions in prompts (spec §4): the UI inserts the localized label ("[Imagem N]",
// "[Image N]", "[Imagen N]", "[图片 N]") so lay users never type the model's syntax; the backend
// converts every form to <imageN> for the encoder.
const MENTION = /\[\s*(?:imagem|imagen|image|图片)\s*(\d{1,2})\s*\]/giu;

/** `word` is the localized word for "image" (i18n key references.mentionWord). */
export const mentionLabel = (n: number, word: string) => `[${word} ${n}]`;

export function mentionsToTokens(prompt: string): string {
  return prompt.replace(MENTION, (_match, n: string) => `<image${Number(n)}>`);
}

/**
 * Renumbers mentions after the reference list changes. `order` lists, for each new position,
 * the old 1-based number it came from. Mentions of removed images become `removedLabel`.
 */
export function renumberMentions(prompt: string, order: number[], word: string, removedLabel: string): string {
  return prompt.replace(MENTION, (_match, n: string) => {
    const index = order.indexOf(Number(n));
    return index === -1 ? removedLabel : mentionLabel(index + 1, word);
  });
}

/** Inverse of mentionsToTokens, for showing model text (e.g. an improved prompt) to users. */
export function tokensToMentions(text: string, word: string): string {
  return text.replace(/<image(\d{1,2})>/g, (_match, n: string) => mentionLabel(Number(n), word));
}
