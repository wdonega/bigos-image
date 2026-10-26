// Video effects (spec §14, decision 31): four ComfyUI workflows that change an uploaded video.
// The user picks an effect, sends the video (and a photo when the effect needs one) and writes at
// most one short text; the worker's vision pass turns the video's first frame into the English
// descriptions each model needs (EffectText).

export const EFFECT_IDS = ["remove_people", "face_swap", "animate", "character_swap"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

export type EffectWorkflow = "fx_clean_plate" | "fx_face_swap" | "fx_animate" | "fx_character_swap";

type EffectSpec = {
  workflow: EffectWorkflow;
  /** The photo the effect needs besides the video: a face, a character, or none. */
  photo: "face" | "character" | null;
  /** Effects that put someone's identity in a video ask the user to confirm consent. */
  consent: boolean;
  /**
   * Seconds of GPU per second of video on the reference GPU (RTX 5060 Ti 16 GB, 10 s spikes): the
   * estimate. Wan Animate is much cheaper within its template's 81 frames (`factorShort`).
   */
  factor: number;
  factorShort?: number;
  /** Longest section the effect handles (VRAM, frames of the model); EFFECT_MAX_SECONDS caps them all. */
  maxSeconds: number;
};

export const EFFECTS: Record<EffectId, EffectSpec> = {
  // LTX 2.3 Clean Plate (#60): erases people and moving objects, keeps the empty scene.
  remove_people: { workflow: "fx_clean_plate", photo: null, consent: false, factor: 62, maxSeconds: 10 },
  // LTX 2.3 head swap (#17): new face and hair, same body, clothes, motion and sound.
  face_swap: { workflow: "fx_face_swap", photo: "face", consent: true, factor: 151, maxSeconds: 10 },
  // Wan Animate 2 (#15): the character in the photo moves like the person in the video.
  animate: { workflow: "fx_animate", photo: "character", consent: true, factor: 329, factorShort: 124, maxSeconds: 10 },
  // MiniMax H3 Character Swap (#14): the whole person is replaced, scene and sound kept.
  character_swap: { workflow: "fx_character_swap", photo: "character", consent: true, factor: 233, maxSeconds: 10 },
};

/**
 * English texts for the graph, per effect: `scene` + `remove` (remove_people), `scene`
 * (face_swap), `character` + `action` (animate), `subject` (character_swap).
 */
export type EffectText = { scene?: string; remove?: string; character?: string; action?: string; subject?: string };

const EMPTY_SCENE = "The same place, completely empty, with nothing moving in it. No people, no person anywhere in the frame.";

/**
 * Texts used when the LLM is missing or fails: generic English descriptions plus the user's text
 * as written (it may not be English; the models still get the gist).
 */
export function fallbackEffectText(effect: EffectId, userText: string): EffectText {
  const text = userText.trim();
  switch (effect) {
    case "remove_people":
      return { scene: EMPTY_SCENE, remove: text ? `person, people, ${text}` : "person, people" };
    case "face_swap":
      return {
        scene: [
          "The person from the face reference, with the same clothes and pose, in the same scene with the same background, props and lighting.",
          text,
        ]
          .filter(Boolean)
          .join(" "),
      };
    case "animate":
      return {
        character: "the character in the reference image",
        action: text || "The character moves exactly like the person in the motion video.",
      };
    case "character_swap":
      // The SAM detector only understands English: anything else falls back to "person".
      return { subject: /^[\x20-\x7e]+$/.test(text) ? text : "person" };
  }
}

/** Text written into the Wan Animate character prompt (format of the template's example). */
export function characterPrompt(description: string): string {
  return `Character appearance description: ${description}`;
}

/**
 * Wan Animate's output size: the template's pixel count (its fixed portrait size) laid out in the
 * driving video's orientation, sides on the multiple of 16 the model works on.
 */
export function animateSize(video: { width: number; height: number }, templatePixels: number) {
  const ratio = video.width > 0 && video.height > 0 ? video.width / video.height : 9 / 16;
  const to16 = (n: number) => Math.max(16, Math.floor(n / 16) * 16);
  return { width: to16(Math.sqrt(templatePixels * ratio)), height: to16(Math.sqrt(templatePixels / ratio)) };
}

/** Frames Wan Animate generates for a section: the driving video's frames on its 4n+1 grid. */
export function animateFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.round((seconds * fps - 1) / 4)) * 4 + 1;
}

/** Wan Animate's template length (81 frames ≈ 3.4 s at 24 fps): longer needs its context windows. */
export const ANIMATE_TEMPLATE_FRAMES = 81;

/** Seconds of GPU an effect takes for a section (Wan Animate: cheaper up to 81 frames at 24 fps). */
export function effectEstimateSeconds(effect: EffectId, seconds: number): number {
  const spec = EFFECTS[effect];
  const short = spec.factorShort && animateFrames(seconds, 24) <= ANIMATE_TEMPLATE_FRAMES;
  return Math.round(seconds * (short ? (spec.factorShort ?? spec.factor) : spec.factor));
}

/** Longest section for an effect: its own limit and EFFECT_MAX_SECONDS. */
export function effectMaxSeconds(effect: EffectId, configMax: number): number {
  return Math.min(EFFECTS[effect].maxSeconds, configMax);
}

/**
 * Size VHS_LoadVideo decodes at (face swap): 0 × 0 keeps the original; videos whose long side is
 * above `maxSide` are scaled down on load so a 4K phone video does not fill the RAM.
 */
export function loadSize(video: { width: number; height: number }, maxSide: number) {
  const side = Math.max(video.width, video.height);
  if (side <= maxSide) return { width: 0, height: 0 };
  const scale = maxSide / side;
  const to8 = (n: number) => Math.max(8, Math.round((n * scale) / 8) * 8);
  return { width: to8(video.width), height: to8(video.height) };
}
