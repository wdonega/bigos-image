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
  /** Minutes for 5 s of video on the reference GPU (RTX 5060 Ti 16 GB, effects spike): shown to the user. */
  minutes: number;
};

export const EFFECTS: Record<EffectId, EffectSpec> = {
  // LTX 2.3 Clean Plate (#60): erases people and moving objects, keeps the empty scene.
  remove_people: { workflow: "fx_clean_plate", photo: null, consent: false, minutes: 5 },
  // LTX 2.3 head swap (#17): new face and hair, same body, clothes, motion and sound.
  face_swap: { workflow: "fx_face_swap", photo: "face", consent: true, minutes: 8 },
  // Wan Animate 2 (#15): the character in the photo moves like the person in the video.
  animate: { workflow: "fx_animate", photo: "character", consent: true, minutes: 8 },
  // MiniMax H3 Character Swap (#14): the whole person is replaced, scene and sound kept.
  character_swap: { workflow: "fx_character_swap", photo: "character", consent: true, minutes: 18 },
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
