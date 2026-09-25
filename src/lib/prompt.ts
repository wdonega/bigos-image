// Prompt sent to the encoder (spec §8.2). Without transparency the text goes exactly as typed.
export function buildPrompt(userPrompt: string, transparentBackground: boolean): string {
  if (!transparentBackground) return userPrompt;
  const subject = userPrompt.trim().replace(/[\s.!?]+$/u, "");
  return `This is an RGBA format image with transparency. ${subject}. The image has an alpha channel and a transparent background.`;
}
