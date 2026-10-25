// Runs ffmpeg/ffprobe for the restoration (spec §14, decision 32). The binaries come from the
// Docker image (mwader/static-ffmpeg) or the PATH in development; FFMPEG_PATH / FFPROBE_PATH override.
import { spawn } from "node:child_process";
import {
  AUDIO_FILTER,
  type ColorId,
  type MediaInfo,
  type Measurements,
  cleanFilters,
  parseCrop,
  parseInterlaced,
  parseProbe,
  previewFilters,
} from "./restore.ts";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

/** How much of the video the border and interlace measurements look at (script: 120 s). */
const MEASURE_SECONDS = 120;
/** stderr kept from a failed run, for the log. */
const STDERR_TAIL = 4000;

export class FfmpegError extends Error {
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = "FfmpegError";
    this.stderr = stderr;
  }
}

type RunOptions = {
  signal?: AbortSignal;
  /** Called with the seconds of output written so far (from -progress). */
  onTime?: (seconds: number) => void;
};

/** Runs a binary; resolves with stdout and stderr, rejects with FfmpegError on a non-zero exit. */
function run(bin: string, args: string[], options: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onTime) {
        for (const m of text.matchAll(/out_time_us=(\d+)/g)) options.onTime(Number(m[1]) / 1e6);
        // -progress writes forever on long runs: keep only the tail.
        if (stdout.length > 4 * STDERR_TAIL) stdout = stdout.slice(-STDERR_TAIL);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const abort = () => child.kill("SIGKILL");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (err) => reject(new FfmpegError(`${bin} could not start: ${err.message}`, "")));
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) reject(new FfmpegError(`${bin} cancelled`, ""));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new FfmpegError(`${bin} exited with ${code}`, stderr.slice(-STDERR_TAIL)));
    });
  });
}

/** ffmpeg with the flags every call shares; analysis passes read stderr (-v info), the rest stays quiet. */
export function ffmpeg(args: string[], options: RunOptions & { verbose?: boolean } = {}) {
  const progress = options.onTime ? ["-progress", "pipe:1", "-nostats"] : [];
  return run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", options.verbose ? "info" : "error", ...progress, ...args], options);
}

/** Video facts, or null when the file has no readable video stream. */
export async function probe(file: string): Promise<MediaInfo | null> {
  try {
    const { stdout } = await run(FFPROBE, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
    return parseProbe(JSON.parse(stdout));
  } catch {
    return null;
  }
}

/** Black borders and interlacing over the first MEASURE_SECONDS (the script's cropdetect and idet). */
export async function measure(file: string, info: MediaInfo): Promise<Measurements> {
  const pass = async (filter: string) =>
    (await ffmpeg(["-t", String(MEASURE_SECONDS), "-i", file, "-map", "0:v:0", "-vf", filter, "-f", "null", "-"], { verbose: true }))
      .stderr;
  const [crop, idet] = await Promise.all([pass("cropdetect=limit=24:round=2"), pass("idet")]);
  return { crop: parseCrop(crop, info), interlaced: parseInterlaced(idet) };
}

/** Frames of the first video stream, counted by packet (exact, unlike the duration). */
export async function frameCount(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, [
    "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file,
  ]);
  return Number.parseInt(stdout.trim(), 10) || 0;
}

/** One cleaned frame at `seconds` as JPEG, for the color previews. */
export function previewFrame(
  file: string,
  info: MediaInfo,
  m: Measurements,
  color: ColorId,
  seconds: number,
  width: number,
  out: string,
) {
  return ffmpeg([
    "-ss", seconds.toFixed(3), "-i", file, "-map", "0:v:0",
    "-vf", previewFilters(info, m, color, width).join(","), "-frames:v", "1", "-q:v", "3", out,
  ]);
}

/** Light H.264 copy (360p) the browser can play and seek, for the trim editor. */
export function proxy(file: string, out: string, options: RunOptions = {}) {
  return ffmpeg(
    [
      "-i", file, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "bwdif=deint=interlaced,scale=-2:360,setsar=1",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out,
    ],
    options,
  );
}

/** `count` thumbnails side by side in one JPEG (the trim editor's filmstrip). */
export function filmstrip(file: string, seconds: number, count: number, height: number, out: string) {
  return ffmpeg([
    "-i", file, "-map", "0:v:0",
    "-vf", `fps=${count}/${Math.max(seconds, 0.1).toFixed(3)},scale=-2:${height},setsar=1,tile=${count}x1`,
    "-frames:v", "1", "-q:v", "4", out,
  ]);
}

/**
 * The cleanup of a section (script's clean): video filters, audio filters, H.264 + AAC. `crf` is
 * lower when an upscale follows (the cleaned file is only an intermediate).
 */
export function clean(
  file: string,
  info: MediaInfo,
  m: Measurements,
  section: { start: number; seconds: number; color: ColorId; crf: number },
  out: string,
  options: RunOptions = {},
) {
  const audio = info.hasAudio ? ["-map", "0:a:0", "-af", AUDIO_FILTER, "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : ["-an"];
  return ffmpeg(
    [
      "-ss", section.start.toFixed(3), "-t", section.seconds.toFixed(3), "-i", file, "-map", "0:v:0",
      "-vf", cleanFilters(info, m, section.color).join(","), ...audio,
      "-c:v", "libx264", "-crf", String(section.crf), "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ],
    options,
  );
}

/** One chunk for SeedVR2: frames [start, start+frames) plus `pad` copies of the last one, silent track. */
export function chunk(cleaned: string, c: { start: number; frames: number; pad: number }, out: string) {
  return ffmpeg([
    "-i", cleaned, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", `trim=start_frame=${c.start}:end_frame=${c.start + c.frames},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=${c.pad}`,
    "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "libx264", "-crf", "12", "-preset", "fast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", out,
  ]);
}

/** The upscaled chunk cut back to its real frames (drops the padding), without audio. */
export function trimFrames(file: string, frames: number, out: string) {
  return ffmpeg(["-i", file, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-pix_fmt", "yuv420p", out]);
}

/** Joins the chunks (concat list file) with the cleaned audio. No -shortest: it drops the last frame. */
export function join(list: string, audioFrom: string, out: string, crf: number) {
  return ffmpeg([
    "-f", "concat", "-safe", "0", "-i", list, "-i", audioFrom, "-map", "0:v", "-map", "1:a?", "-c:a", "copy",
    "-c:v", "libx264", "-crf", String(crf), "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
  ]);
}
