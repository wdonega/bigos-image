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

/** Numbers of the images mentioned in a text (any language), distinct and sorted. */
export function mentionNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(MENTION)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** An LLM sometimes drops the brackets ("da Imagem 1"): put them back, keeping its word. */
export function repairMentions(text: string): string {
  return text.replace(
    /(?<![[\p{L}])(imagem|imagen|image|图片)\s*(\d{1,2})(?![\d\]])/giu,
    (_m, word: string, n: string) => `[${word} ${Number(n)}]`,
  );
}
