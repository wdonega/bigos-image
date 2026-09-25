// Image mentions in prompts (spec §4, proposal): the UI inserts "[Imagem N]" so lay users never
// type the model's syntax; the backend converts them to <imageN> for the encoder.
const MENTION = /\[\s*imagem\s+(\d{1,2})\s*\]/giu;

export const mentionLabel = (n: number) => `[Imagem ${n}]`;

export function mentionsToTokens(prompt: string): string {
  return prompt.replace(MENTION, (_match, n: string) => `<image${Number(n)}>`);
}

/**
 * Renumbers mentions after the reference list changes. `order` lists, for each new position,
 * the old 1-based number it came from. Mentions of removed images become "[Imagem removida]".
 */
export function renumberMentions(prompt: string, order: number[]): string {
  return prompt.replace(MENTION, (_match, n: string) => {
    const index = order.indexOf(Number(n));
    return index === -1 ? "[Imagem removida]" : mentionLabel(index + 1);
  });
}
