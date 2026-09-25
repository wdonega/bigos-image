// Image mentions in prompts (spec §4): the UI inserts "[Image N]" (EN) or "[Imagem N]" (PT) so
// lay users never type the model's syntax; the backend converts both to <imageN> for the encoder.
const MENTION = /\[\s*(?:imagem|image)\s+(\d{1,2})\s*\]/giu;

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
