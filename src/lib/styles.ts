// Image styles: each one appends a fixed English phrase to the prompt, so choosing a style is
// instant, free and predictable (no LLM involved). Names shown to users live in i18n (styles.*).
// Categories follow the ComfyUI LLM prompt enhancer node (pinkpixel-dev/comfyui-llm-prompt-enhancer).

export const STYLE_CATEGORIES = [
  "core",
  "fantasy",
  "modern",
  "movements",
  "asian",
  "traditional",
  "digital",
  "photo",
  "decorative",
  "period",
] as const;
export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

export type Style = { id: string; category: StyleCategory; prompt: string };

export const STYLES = [
  { id: "detailed", category: "core", prompt: "highly detailed, intricate textures, sharp focus" },
  { id: "photorealistic", category: "core", prompt: "photorealistic, natural light, realistic textures, high detail" },
  { id: "cinematic", category: "core", prompt: "cinematic still, dramatic lighting, shallow depth of field, film grain" },
  { id: "artistic", category: "core", prompt: "artistic interpretation, expressive composition, painterly details" },
  { id: "minimal", category: "core", prompt: "minimalist, clean composition, simple shapes, plenty of negative space" },
  { id: "fantasy", category: "fantasy", prompt: "fantasy art, magical atmosphere, epic scenery" },
  { id: "horror", category: "fantasy", prompt: "horror style, eerie atmosphere, dark shadows, unsettling mood" },
  { id: "dark-fantasy", category: "fantasy", prompt: "dark fantasy, gothic mood, moody lighting, mysterious" },
  { id: "heavenly", category: "fantasy", prompt: "heavenly, ethereal glow, soft divine light, luminous clouds" },
  { id: "cyberpunk", category: "modern", prompt: "cyberpunk, neon lights, futuristic city, high contrast" },
  { id: "steampunk", category: "modern", prompt: "steampunk, brass gears, Victorian machinery, warm tones" },
  { id: "street-art", category: "modern", prompt: "street art, graffiti style, bold colors, spray paint texture" },
  { id: "vaporwave", category: "modern", prompt: "vaporwave aesthetic, pastel pink and cyan, retro digital" },
  { id: "abstract", category: "movements", prompt: "abstract art, bold shapes, non-representational forms" },
  { id: "expressionist", category: "movements", prompt: "expressionist painting, emotional brushwork, distorted forms" },
  { id: "abstract-expressionist", category: "movements", prompt: "abstract expressionism, gestural paint strokes, energetic" },
  { id: "futurist", category: "movements", prompt: "futurism art movement, dynamic motion lines, speed" },
  { id: "surrealist", category: "movements", prompt: "surrealist painting, dreamlike, impossible scenery" },
  { id: "art-nouveau", category: "movements", prompt: "art nouveau, flowing organic lines, ornamental frame" },
  { id: "art-deco", category: "movements", prompt: "art deco, geometric patterns, gold accents, elegant" },
  { id: "baroque", category: "movements", prompt: "baroque painting, dramatic chiaroscuro, rich details" },
  { id: "renaissance", category: "movements", prompt: "renaissance painting, classical composition, oil on canvas" },
  { id: "pop-art", category: "movements", prompt: "pop art, bold outlines, halftone dots, vivid colors" },
  { id: "bauhaus", category: "movements", prompt: "bauhaus design, primary colors, geometric shapes" },
  { id: "romanticist", category: "movements", prompt: "romanticism painting, sublime nature, emotional light" },
  { id: "dada", category: "movements", prompt: "dada collage, absurd juxtaposition, cut paper" },
  { id: "anime", category: "asian", prompt: "anime style, clean line art, cel shading, vibrant colors" },
  { id: "studio-ghibli", category: "asian", prompt: "Studio Ghibli style, hand-drawn animation, soft colors, whimsical" },
  { id: "ukiyo-e", category: "asian", prompt: "ukiyo-e woodblock print, flat colors, bold outlines" },
  { id: "sumi-e", category: "asian", prompt: "sumi-e ink wash painting, black ink, minimal brush strokes" },
  { id: "howls-castle", category: "asian", prompt: "Howl's Moving Castle style, whimsical steampunk fantasy, painterly skies" },
  { id: "oil-painting", category: "traditional", prompt: "oil painting, visible brush strokes, rich colors" },
  { id: "watercolor", category: "traditional", prompt: "watercolor painting, soft washes, paper texture" },
  { id: "gouache", category: "traditional", prompt: "gouache painting, matte opaque colors, flat shapes" },
  { id: "pencil-sketch", category: "traditional", prompt: "pencil sketch, graphite lines, cross-hatching, paper" },
  { id: "charcoal", category: "traditional", prompt: "charcoal drawing, smudged shading, high contrast" },
  { id: "pastel", category: "traditional", prompt: "soft pastel drawing, chalky texture, gentle colors" },
  { id: "3d-render", category: "digital", prompt: "3D render, soft studio lighting, smooth materials" },
  { id: "digital-art", category: "digital", prompt: "digital painting, rich colors, detailed illustration" },
  { id: "concept-art", category: "digital", prompt: "concept art, cinematic composition, painterly environment" },
  { id: "comic-book", category: "digital", prompt: "comic book style, ink outlines, halftone shading" },
  { id: "pixel-art", category: "digital", prompt: "pixel art, 16-bit, limited palette" },
  { id: "low-poly", category: "digital", prompt: "low poly 3D, faceted geometry, flat shading" },
  { id: "isometric", category: "digital", prompt: "isometric illustration, clean geometry, diorama view" },
  { id: "studio-photography", category: "photo", prompt: "professional studio photography, softbox lighting, seamless backdrop" },
  { id: "vibrant", category: "photo", prompt: "vibrant colors, high saturation, bright and punchy" },
  { id: "stained-glass", category: "decorative", prompt: "stained glass window, lead lines, glowing colored glass" },
  { id: "mosaic", category: "decorative", prompt: "mosaic art, small tiles, tessellated pattern" },
  { id: "gothic", category: "decorative", prompt: "gothic art, pointed arches, dark ornate details" },
  { id: "retro", category: "period", prompt: "retro 1980s style, faded colors, nostalgic" },
  { id: "vintage", category: "period", prompt: "vintage photograph, sepia tones, film grain, aged paper" },
] as const satisfies readonly Style[];

export type StyleId = (typeof STYLES)[number]["id"];
export const STYLE_IDS = STYLES.map((s) => s.id) as StyleId[];

export function findStyle(id: string): (typeof STYLES)[number] | undefined {
  return STYLES.find((s) => s.id === id);
}

/** Appends the style's phrase; no style leaves the prompt untouched. */
export function applyStyle(prompt: string, styleId: StyleId | null): string {
  const style = styleId ? findStyle(styleId) : undefined;
  if (!style) return prompt;
  return `${prompt.trim().replace(/[\s.,;]+$/u, "")}. ${style.prompt}.`;
}
