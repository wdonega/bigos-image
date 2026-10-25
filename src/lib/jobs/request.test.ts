import { describe, expect, it } from "vitest";
import { testConfig } from "../test-config";
import { type UploadLookup, jobRequestSchema, planJob } from "./request";

const parse = (body: unknown) => jobRequestSchema.parse(body);
const base = { screen: "generate", prompt: "um gato", size: { ratio: "1:1", megapixels: 1 } };
const found: UploadLookup = async (id) => ({ id });
const missing: UploadLookup = async () => null;
const plan = (body: unknown, lookup = found) => planJob(parse(body), testConfig, lookup);

describe("planJob — Generate without references", () => {
  it("defaults to 1:1 · 1 MP, normal quality, random seed, t2i", async () => {
    const p = await plan(base);
    expect(p).toMatchObject({
      workflow: "t2i",
      text: "um gato",
      size: { width: 1024, height: 1024 },
      steps: 25,
      transparentBackground: false,
      images: [],
    });
    expect(Number.isSafeInteger(p.seed)).toBe(true);
  });

  it("recomputes preset sizes and maps quality to steps", async () => {
    const p = await plan({ ...base, size: { ratio: "16:9", megapixels: 2 }, quality: "high" });
    expect(p).toMatchObject({ size: { width: 1920, height: 1088 }, steps: 40 });
  });

  it("ignores a seed sent by the client and draws a random one", async () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 5; i++) seeds.add((await plan({ ...base, seed: 5 })).seed);
    expect(seeds.has(5)).toBe(false);
    expect(seeds.size).toBe(5);
  });

  it("accepts a valid Manual size", async () => {
    const p = await plan({ ...base, size: { ratio: "manual", width: 1280, height: 736 } });
    expect(p.size).toEqual({ width: 1280, height: 736 });
  });

  it("rejects an invalid Manual size with translatable reasons", async () => {
    const err = await plan({ ...base, size: { ratio: "manual", width: 1000, height: 300 } }).catch((e) => e);
    expect(err).toMatchObject({ code: "invalid_size", status: 400 });
    expect(err.details).toEqual([{ code: "not_multiple" }, { code: "below_min_side", params: { min: 512 } }]);
  });

  it("rejects Original without a reference image", async () => {
    await expect(plan({ ...base, size: { ratio: "original" } })).rejects.toMatchObject({
      code: "invalid_request",
      details: [{ code: "original_needs_image" }],
    });
  });

  it("accepts Original on the Generate screen with references: the size follows image_1", async () => {
    const p = await plan({ ...base, size: { ratio: "original" }, images: ["u1", "u2"] });
    expect(p).toMatchObject({ workflow: "edit", size: null, images: ["u1", "u2"] });
  });

  it("keeps the prompt exactly as typed", async () => {
    expect((await plan({ ...base, prompt: "  [Imagem 1] cru " })).text).toBe("  [Imagem 1] cru ");
  });
});

describe("planJob — style and improved text", () => {
  it("keeps the style phrase for the final pass and appends it in the fallback", async () => {
    const p = await plan({ ...base, prompt: "um gato", style: "watercolor" });
    expect(p).toMatchObject({
      text: "um gato",
      style: "watercolor painting, soft washes, paper texture",
      fallbackPrompt: "um gato. watercolor painting, soft washes, paper texture.",
    });
    expect((await plan(base)).style).toBeNull();
  });

  it("converts mentions before the final pass and in the fallback", async () => {
    const p = await plan({ ...base, prompt: "gato da [Imagem 1]", images: ["u1"], style: "anime" });
    expect(p.text).toBe("gato da <image1>");
    expect(p.fallbackPrompt).toBe("gato da <image1>. anime style, clean line art, cel shading, vibrant colors.");
  });

  it("rejects unknown styles", () => {
    expect(() => parse({ ...base, style: "nope" })).toThrow();
  });
});

describe("planJob — references and Edit", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

  it("switches to the edit workflow with the first reference", async () => {
    const p = await plan({ ...base, prompt: "o gato da [Imagem 1] com a [Imagem 2]", images: ids(2) });
    expect(p).toMatchObject({
      workflow: "edit",
      images: ["u1", "u2"],
      size: { width: 1024, height: 1024 },
      text: "o gato da <image1> com a <image2>",
    });
  });

  it("accepts MAX_REFS references and rejects one more", async () => {
    await expect(plan({ ...base, images: ids(10) })).resolves.toMatchObject({ workflow: "edit" });
    await expect(plan({ ...base, images: ids(11) })).rejects.toMatchObject({ code: "too_many_images" });
  });

  it("Edit needs exactly one image and allows Original (size null)", async () => {
    const edit = { ...base, screen: "edit", size: { ratio: "original" } };
    await expect(plan({ ...edit, images: ids(1) })).resolves.toMatchObject({ workflow: "edit", size: null });
    await expect(plan({ ...edit, images: [] })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(plan({ ...edit, images: ids(2) })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("Edit with another proportion sends the computed size", async () => {
    const p = await plan({ ...base, screen: "edit", images: ids(1), size: { ratio: "9:16", megapixels: 1 } });
    expect(p.size).toEqual({ width: 768, height: 1376 });
  });

  it("rejects unknown or expired uploads", async () => {
    await expect(plan({ ...base, images: ["gone"] }, missing)).rejects.toMatchObject({
      code: "upload_not_found",
    });
  });
});

describe("jobRequestSchema", () => {
  it("rejects blank prompts and unknown sizes", () => {
    expect(jobRequestSchema.safeParse({ ...base, prompt: "   " }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...base, size: { ratio: "5:4", megapixels: 1 } }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...base, size: { ratio: "1:1", megapixels: 3 } }).success).toBe(false);
  });
});

describe("planJob — video", () => {
  const video = { screen: "video", prompt: "um cachorro correndo na praia", ratio: "16:9", duration: 5 };

  it("text only: FL2VA graph, 124 frames, ≈720p on Normal", async () => {
    const p = await plan(video);
    expect(p).toMatchObject({
      workflow: "video_fl2va",
      size: { width: 1280, height: 736 },
      video: { frames: 124, seconds: 5 },
      images: [],
      transparentBackground: false,
    });
    expect(p.fallbackPrompt).toBe("detailed_description: um cachorro correndo na praia\n\nnon_diegetic_music: N/A");
  });

  it("references: Ref2VA graph, mentions become subjects in the fallback", async () => {
    const p = await plan({ ...video, prompt: "o gato da [Imagem 1] pinta", images: ["u1"], duration: 15, quality: "high", ratio: "9:16" });
    expect(p).toMatchObject({ workflow: "video_ref2va", size: { width: 1088, height: 1920 }, video: { frames: 362 } });
    expect(p.text).toBe("o gato da <image1> pinta");
    expect(p.fallbackPrompt).toContain("detailed_description: o gato da <Subject 1> pinta");
    expect(p.fallbackPrompt).toContain("<Subject 1> is the subject shown in <Picture 1>.");
  });

  it("rejects durations and proportions that are not offered, and too many references", async () => {
    expect(jobRequestSchema.safeParse({ ...video, duration: 7 }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...video, ratio: "3:2" }).success).toBe(false);
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`);
    await expect(plan({ ...video, images: ids })).rejects.toMatchObject({ code: "too_many_images" });
  });
});

describe("planJob — music", () => {
  const music = { screen: "music", prompt: "uma música animada sobre o fim de semana", duration: 60 };

  it("plans a song: lyrics as written, genre phrase kept for the final pass", async () => {
    const p = await plan({ ...music, lyrics: "Chegou o sábado\no sol abriu", genre: "samba" });
    expect(p).toMatchObject({
      workflow: "music",
      style: "Brazilian samba",
      images: [],
      music: { lyrics: "[Verse]\nChegou o sábado\no sol abriu", instrumental: false, seconds: 60 },
    });
    expect(p.fallbackPrompt).toBe("Global Metadata: Brazilian samba. uma música animada sobre o fim de semana.");
  });

  it("instrumental ignores the lyrics box", async () => {
    const p = await plan({ ...music, lyrics: "ignored", instrumental: true });
    expect(p.music).toMatchObject({ lyrics: "[Instrumental]", instrumental: true });
  });

  it("rejects durations and genres that are not offered", () => {
    expect(jobRequestSchema.safeParse({ ...music, duration: 45 }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...music, genre: "polka" }).success).toBe(false);
  });
});

describe("planJob — video effects (spec §14, decision 31)", () => {
  const video = { id: "v1", kind: "video" as const, width: 1280, height: 736, seconds: 12, hasFrame: true };
  const lookup: UploadLookup = async (id) => (id === "v1" ? video : id === "p1" ? { id, kind: "image" } : null);
  const fx = (body: Record<string, unknown>) => plan({ screen: "effects", video: "v1", ...body }, lookup);

  it("remove_people needs only the video; the length is capped at EFFECT_MAX_SECONDS", async () => {
    const p = await fx({ effect: "remove_people", prompt: " o carro " });
    expect(p).toMatchObject({
      workflow: "fx_clean_plate",
      text: "o carro",
      images: [],
      effect: { id: "remove_people", video: "v1", width: 1280, height: 736, seconds: 5, hasFrame: true },
    });
  });

  it("keeps shorter videos whole", async () => {
    const short: UploadLookup = async (id) => (id === "v1" ? { ...video, seconds: 3.2 } : { id, kind: "image" });
    const p = await planJob(parse({ screen: "effects", effect: "remove_people", video: "v1" }), testConfig, short);
    expect(p.effect?.seconds).toBe(3.2);
  });

  it("photo effects need the photo and the consent", async () => {
    await expect(fx({ effect: "face_swap", consent: true })).rejects.toMatchObject({
      details: [{ code: "effect_needs_photo", params: { photo: "face" } }],
    });
    await expect(fx({ effect: "character_swap", images: ["p1"] })).rejects.toMatchObject({
      details: [{ code: "consent_required" }],
    });
    const p = await fx({ effect: "animate", images: ["p1"], consent: true });
    expect(p).toMatchObject({ workflow: "fx_animate", images: ["p1"] });
  });

  it("refuses a video id that is an image, and an image id that is a video", async () => {
    await expect(fx({ effect: "remove_people", video: "p1" })).rejects.toMatchObject({ code: "upload_not_found" });
    await expect(fx({ effect: "face_swap", images: ["v1"], consent: true })).rejects.toMatchObject({ code: "upload_not_found" });
  });

  it("ignores a photo sent to an effect that takes none", async () => {
    expect((await fx({ effect: "remove_people", images: ["p1"] })).images).toEqual([]);
  });
});

describe("planJob — old video restoration (spec §14, decision 32)", () => {
  const tape = { id: "t1", kind: "tape" as const, info: { seconds: 600 } };
  const lookup: UploadLookup = async (id) => (id === "t1" ? tape : id === "p1" ? { id, kind: "image" } : null);
  const restore = (body: Record<string, unknown>) => plan({ screen: "restore", upload: "t1", start: 10, end: 40, ...body }, lookup);

  it("plans the chosen section with the defaults (normalize, upscale)", async () => {
    expect(await restore({})).toMatchObject({
      workflow: "restore",
      restore: { upload: "t1", start: 10, seconds: 30, color: "normalize", mode: "upscale", state: { chunksDone: 0 } },
    });
  });

  it("limits the section per mode: short with the upscale, long for the cleanup", async () => {
    await expect(restore({ end: 75 })).rejects.toMatchObject({ details: [{ code: "section_too_long", params: { max: 60 } }] });
    expect((await restore({ end: 400, mode: "clean" })).restore?.seconds).toBe(390);
  });

  it("refuses sections past the end, shorter than 1 s, and uploads that are not tapes", async () => {
    await expect(restore({ start: 590, end: 620 })).rejects.toMatchObject({ details: [{ code: "section_invalid" }] });
    await expect(restore({ start: 10, end: 10.5 })).rejects.toMatchObject({ details: [{ code: "section_invalid" }] });
    await expect(restore({ upload: "p1" })).rejects.toMatchObject({ code: "upload_not_found" });
  });

  it("accepts an end handle a hair past the last frame", async () => {
    expect((await restore({ start: 570, end: 600.2 })).restore?.seconds).toBe(30);
  });
});
