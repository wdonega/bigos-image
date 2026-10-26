// Old video restoration (spec §14, decision 32): the ffmpeg cleanup of
// comfyui-workflows/usecases/vhs-upscale/restore_vhs.py, as pure functions. src/lib/ffmpeg.ts runs
// the commands; the worker chains cleanup → SeedVR2 upscale in chunks → join.

/** Color corrections, in the order the screen shows them; normalize is the default (script's tests). */
export const COLOR_IDS = ["normalize", "mild", "strong", "auto", "auto45", "colorcorrect", "none"] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const COLORS: Record<ColorId, string | null> = {
  normalize: "normalize=blackpt=black:whitept=white:smoothing=24:independence=0.6:strength=0.7",
  mild: "colortemperature=temperature=8500:mix=0.6,eq=saturation=1.05",
  strong: "colortemperature=temperature=10000:mix=0.7,eq=saturation=1.05",
  auto: "grayworld",
  auto45: "split[cx][cy];[cy]grayworld[cg];[cx][cg]blend=all_mode=normal:all_opacity=0.45",
  colorcorrect: "colorcorrect=analyze=median",
  none: null,
};

export const AUDIO_FILTER = "highpass=f=60,afftdn=nf=-30,loudnorm=I=-18:TP=-1.5";

export const RESTORE_MODES = ["clean", "upscale"] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

/**
 * SeedVR2 graphs: "gguf" is usecases/vhs-upscale-v2 (numz's custom node, 3B GGUF Q8_0, ~3x faster),
 * "native" is v1 (ComfyUI's own SeedVR2, no custom node). `factor` is the measured GPU seconds per
 * second of video at 720p (RTX 5060 Ti), the estimate's default when RESTORE_UPSCALE_FACTOR is unset.
 */
export const UPSCALERS = {
  gguf: { workflow: "restore_seedvr2_v2", factor: 50 },
  native: { workflow: "restore_seedvr2", factor: 110 },
} as const;
export type Upscaler = keyof typeof UPSCALERS;

/** Codecs whose compression blocks the deblock filter smooths (MPEG-1/2/4, WMV). */
const BLOCKY_CODECS = new Set(["mpeg2video", "mpeg1video", "mpeg4", "msmpeg4v3", "wmv2", "wmv3"]);

/** Up to which height a capture is standard definition (head-switching noise at the bottom). */
const SD_MAX_HEIGHT = 576;
/** Lines of head-switching noise cut from the bottom of SD captures. */
const HEAD_SWITCH_LINES = 12;
/** Extra pixels cut from each side for the ragged VHS edge. */
const EDGE_MARGIN = 2;
/** Share of interlaced frames above which the video is deinterlaced (the script's test captures were 97% progressive). */
const INTERLACED_SHARE = 0.25;

export type MediaInfo = {
  width: number;
  height: number;
  /** Pixel aspect ratio (8:9 → 0.889 on NTSC DVD captures). */
  sar: number;
  codec: string;
  seconds: number;
  fps: number;
  hasAudio: boolean;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  /** Phones store portrait video as landscape plus a rotation (ffmpeg applies it when decoding). */
  side_data_list?: { rotation?: number }[];
};

/** "8:9" or "30000/1001" → number; 0 when missing, malformed or zero. */
const ratio = (text: string | undefined) => {
  const m = text?.match(/^(\d+)[:/](\d+)$/);
  if (!m) return 0;
  const [n, d] = [Number(m[1]), Number(m[2])];
  return n > 0 && d > 0 ? n / d : 0;
};

/** ffprobe -show_streams -show_format -of json → what the cleanup needs; null without a video stream. */
export function parseProbe(json: { streams?: ProbeStream[]; format?: { duration?: string } }): MediaInfo | null {
  const video = json.streams?.find((s) => s.codec_type === "video" && (s.width ?? 0) > 0);
  if (!video?.width || !video.height) return null;
  const rotation = Math.abs(video.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? 0) % 180;
  return {
    width: rotation === 90 ? video.height : video.width,
    height: rotation === 90 ? video.width : video.height,
    sar: ratio(video.sample_aspect_ratio) || 1,
    codec: video.codec_name ?? "",
    seconds: Number(json.format?.duration ?? 0) || 0,
    fps: ratio(video.avg_frame_rate) || ratio(video.r_frame_rate) || 30,
    hasAudio: json.streams?.some((s) => s.codec_type === "audio") ?? false,
  };
}

export type Crop = { width: number; height: number; x: number; y: number };

/**
 * The most frequent cropdetect suggestion (ffmpeg stderr), plus the VHS edge margin and, on SD
 * captures, the head-switching lines at the bottom. Sides stay even.
 */
export function parseCrop(stderr: string, info: Pick<MediaInfo, "width" | "height">): Crop {
  const counts = new Map<string, number>();
  for (const m of stderr.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const [found, foundHeight, foundX, y] = best ? best.split(":").map(Number) : [info.width, info.height, 0, 0];
  const width = found - 2 * EDGE_MARGIN;
  const height = info.height <= SD_MAX_HEIGHT ? Math.min(foundHeight, info.height - y - HEAD_SWITCH_LINES) : foundHeight;
  return { width: width - (width % 2), height: height - (height % 2), x: foundX + EDGE_MARGIN, y };
}

/** idet's last multi-frame summary (ffmpeg stderr): interlaced when TFF + BFF pass the threshold. */
export function parseInterlaced(stderr: string): boolean {
  const last = [...stderr.matchAll(/Multi frame detection: TFF:\s*(\d+) BFF:\s*(\d+) Progressive:\s*(\d+)/g)].at(-1);
  if (!last) return false;
  const [tff, bff, progressive] = last.slice(1).map(Number);
  return tff + bff > INTERLACED_SHARE * (tff + bff + progressive);
}

/** What the cleanup measures once per upload: borders and interlacing. */
export type Measurements = { crop: Crop; interlaced: boolean };

/** Square-pixel size after the crop: width scaled by the pixel aspect ratio, sides even. */
export function cleanSize(info: Pick<MediaInfo, "sar">, crop: Crop) {
  return { width: Math.round((crop.width * info.sar) / 2) * 2, height: crop.height };
}

/**
 * The -vf chain of the cleanup: crop, deinterlace (only when needed; bwdif send_field doubles the
 * frame rate), deblock (blocky codecs), noise reduction, color, square pixels.
 */
export function cleanFilters(info: MediaInfo, m: Measurements, color: ColorId): string[] {
  const size = cleanSize(info, m.crop);
  const vf = [`crop=${m.crop.width}:${m.crop.height}:${m.crop.x}:${m.crop.y}`];
  if (m.interlaced) vf.push("bwdif=mode=send_field:parity=auto");
  if (BLOCKY_CODECS.has(info.codec)) vf.push("deblock=filter=weak:block=8");
  vf.push("nlmeans=s=2.5:p=7:r=11");
  const colorFilter = COLORS[color];
  if (colorFilter) vf.push(colorFilter);
  vf.push(`scale=${size.width}:${size.height}:flags=lanczos`, "setsar=1");
  return vf;
}

/**
 * The same chain for a one-frame preview at `width`: bwdif keeps one frame per frame here
 * (send_frame), since a single picture has no field to send.
 */
export function previewFilters(info: MediaInfo, m: Measurements, color: ColorId, width: number): string[] {
  const size = cleanSize(info, m.crop);
  const vf = cleanFilters(info, m, color)
    .slice(0, -2)
    .map((f) => (f.startsWith("bwdif=") ? "bwdif=mode=send_frame:parity=auto" : f));
  const height = Math.round((width * size.height) / size.width / 2) * 2;
  vf.push(`scale=${width}:${height}:flags=lanczos`, "setsar=1");
  return vf;
}

/** Upscale size: the target height, width from the cleaned aspect on multiples of 16 (script). */
export function upscaleSize(cleaned: { width: number; height: number }, height: number) {
  return { width: Math.round((height * (cleaned.width / cleaned.height)) / 16) * 16, height };
}

/**
 * What each graph needs to reach `height`: v1 resizes to width × height before SeedVR2; the v2 node
 * takes the shortest edge and keeps the aspect itself (a portrait video comes out `height` wide).
 */
export function upscaleTarget(upscaler: Upscaler, cleaned: { width: number; height: number }, height: number) {
  if (upscaler === "gguf") return { node: "@upscale", inputs: { resolution: height } };
  const size = upscaleSize(cleaned, height);
  return { node: "@size", inputs: { "resize_type.width": size.width, "resize_type.height": size.height } };
}

/**
 * Chunks for ComfyUI: `perChunk` must be 4n+1 (SeedVR2 only returns every frame for 4n+1). Each
 * chunk's last frame is repeated `pad` times up to 4n+1; the extra frames are cut after the upscale.
 */
export function chunkPlan(totalFrames: number, perChunk: number) {
  if (perChunk % 4 !== 1) throw new Error("chunk size must be 4n+1 frames");
  const chunks: { start: number; frames: number; pad: number }[] = [];
  for (let start = 0; start < totalFrames; start += perChunk) {
    const frames = Math.min(perChunk, totalFrames - start);
    chunks.push({ start, frames, pad: (4 - ((frames - 1) % 4)) % 4 });
  }
  return chunks;
}

/** Seconds of work for a section: GPU for the upscale, CPU for the cleanup alone. */
export function estimateSeconds(seconds: number, mode: RestoreMode, factors: { upscale: number; clean: number }) {
  return Math.round(seconds * (mode === "upscale" ? factors.upscale : factors.clean));
}

/** Warning level of an estimate against the thresholds (minutes, ascending): 0 = fine … 3 = longest. */
export function estimateLevel(seconds: number, thresholdsMinutes: number[]): number {
  return thresholdsMinutes.filter((m) => seconds > m * 60).length;
}
