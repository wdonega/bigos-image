// Video (spec §14, decision 28): MiniMax H3 through ComfyUI's native nodes. Pure helpers: the
// options offered on screen, frame counts, output size and the prompt text in MiniMax's format.
import { SIZE_MULTIPLE } from "./size.ts";

export const VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
export type VideoRatio = (typeof VIDEO_RATIOS)[number];

/** Seconds offered on screen; H3 was trained on ~5–15 s. */
export const VIDEO_DURATIONS = [5, 8, 10, 15] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const VIDEO_FPS = 24;

/** Frame count for a duration: H3 takes 17k + 5 frames at 24 fps (5 s → 124, 15 s → 362). */
export function videoFrames(seconds: number): number {
  return 5 + 17 * Math.ceil((seconds * VIDEO_FPS - 5) / 17);
}

/** Output size for a proportion and a pixel budget (Quality), multiples of 32. */
export function videoSize(ratio: VideoRatio, pixels: number): { width: number; height: number } {
  const [a, b] = ratio.split(":").map(Number);
  const width = Math.sqrt((pixels * a) / b);
  const snap = (v: number) => Math.max(SIZE_MULTIPLE, Math.round(v / SIZE_MULTIPLE) * SIZE_MULTIPLE);
  return { width: snap(width), height: snap((width * b) / a) };
}

/** <imageN> tokens (from the user's [Imagem N]) → <Subject N>, bound to <Picture N> below. */
export function tokensToSubjects(text: string): string {
  return text.replace(/<image(\d{1,2})>/g, (_m, n: string) => `<Subject ${Number(n)}>`);
}

export type VideoPromptParts = {
  /** What happens, in English; may mention <Subject N>. */
  description: string;
  /** Sounds of the scene; empty = left to the model. */
  soundscape: string;
  /** Background music; empty = none ("N/A", the guide's own value). */
  music: string;
  /** Number of reference images (<Picture 1>…); 0 = text to video. */
  references: number;
};

/**
 * The prompt in MiniMax's own notation (VIDEO_PROMPT_WRITING_GUIDE, as written by the
 * ComfyUI-MiniMaxH3-Director node): sections only when they have content; `N/A` for no music;
 * an empty soundscape is left out rather than claiming silence.
 */
export function buildVideoPrompt({ description, soundscape, music, references }: VideoPromptParts): string {
  const sections: string[] = [];
  if (references > 0) {
    const subjects = Array.from(
      { length: references },
      (_, i) => `<Subject ${i + 1}> is the subject shown in <Picture ${i + 1}>.`,
    );
    sections.push(`subject_definitions:\n${subjects.join("\n")}`);
    const who = Array.from({ length: references }, (_, i) => `<Subject ${i + 1}>`).join(", ");
    sections.push(`summary: [reference generation] The target video features ${who}.`);
  }
  sections.push(`detailed_description: ${description.trim()}`);
  if (soundscape.trim()) sections.push(`overall_soundscape: ${soundscape.trim()}`);
  sections.push(`non_diegetic_music: ${music.trim() || "N/A"}`);
  return sections.join("\n\n");
}
