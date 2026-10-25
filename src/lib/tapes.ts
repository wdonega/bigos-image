// Old videos uploaded for restoration (spec §14, decision 32). Captures can be gigabytes, so the
// upload is streamed straight to disk. The browser can't play MPEG-2/AVI/DV, so a light H.264 copy
// and a filmstrip are made in the background for the trim editor; color previews come on demand.
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import type { Config } from "./config.ts";
import { AppError, type Detail } from "./errors.ts";
import { ffmpeg, filmstrip, measure, previewFrame, probe, proxy } from "./ffmpeg.ts";
import { COLOR_IDS, type ColorId, type MediaInfo, type Measurements, cleanSize } from "./restore.ts";
import { readStored, storageFile, writeStored } from "./storage.ts";

/** What ffmpeg reads from old captures and cameras (the script's list); anything else is refused. */
export const TAPE_EXTENSIONS = ["mpg", "mpeg", "vob", "avi", "dv", "mov", "mp4", "m4v", "mkv", "wmv", "3gp", "ts", "m2ts", "flv"];

const UUID = /^[0-9a-f-]{36}$/;
/** Shortest video worth restoring. */
const MIN_SECONDS = 1;
/** Thumbnails in the filmstrip and their height, for the trim editor. */
const STRIP_COUNT = 40;
const STRIP_HEIGHT = 72;
/** Width of the color previews. */
const PREVIEW_WIDTH = 480;

export type TapeMeta = {
  id: string;
  kind: "tape";
  /** File name as uploaded (shown to the user). */
  name: string;
  ext: string;
  info: MediaInfo;
  measurements: Measurements;
  /** Square-pixel size after the cleanup (crop + pixel aspect). */
  cleanWidth: number;
  cleanHeight: number;
  /** The proxy and filmstrip for the trim editor. */
  media: "pending" | "ready" | "failed";
  warnings: Detail[];
};

export type PreviewChoice = ColorId | "original";
export const PREVIEW_CHOICES: PreviewChoice[] = ["original", ...COLOR_IDS];

const file = (config: Config, name: string) => storageFile(config, "uploads", name);
export const tapeFile = (config: Config, meta: Pick<TapeMeta, "id" | "ext">) => file(config, `${meta.id}.${meta.ext}`);
export const proxyFile = (config: Config, id: string) => file(config, `${id}_proxy.mp4`);
export const stripFile = (config: Config, id: string) => file(config, `${id}_strip.jpg`);
export const previewFile = (config: Config, id: string, ms: number, choice: PreviewChoice) =>
  file(config, `${id}_p${ms}_${choice}.jpg`);

/** The extension of an uploaded name, lowercased, when it is one ffmpeg should read; else null. */
export function tapeExtension(name: string): string | null {
  const ext = path.extname(name).slice(1).toLowerCase();
  return TAPE_EXTENSIONS.includes(ext) ? ext : null;
}

const maxDetail = (config: Config): Detail => ({
  code: "max_video_upload_mb",
  params: { max: Math.round(config.restore.maxUploadBytes / 1024 / 1024) },
});

/** Streams an upload to disk, then reads and measures it. Refuses non-videos and oversize bodies. */
export async function saveTape(config: Config, body: ReadableStream<Uint8Array>, name: string): Promise<TapeMeta> {
  const ext = tapeExtension(name);
  if (!ext) throw new AppError("invalid_video", 400);
  const id = randomUUID();
  const target = tapeFile(config, { id, ext });
  await mkdir(path.dirname(target), { recursive: true });
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > config.restore.maxUploadBytes) done(new AppError("video_too_large", 413, [maxDetail(config)]));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as NodeReadableStream<Uint8Array>), limit, createWriteStream(target));
    const info = await probe(target);
    if (!info) throw new AppError("invalid_video", 400);
    if (info.seconds < MIN_SECONDS) {
      throw new AppError("invalid_video", 400, [{ code: "video_too_short", params: { min: MIN_SECONDS } }]);
    }
    const measurements = await measure(target, info);
    const size = cleanSize(info, measurements.crop);
    const meta: TapeMeta = {
      id,
      kind: "tape",
      name: path.basename(name).slice(0, 200),
      ext,
      info,
      measurements,
      cleanWidth: size.width,
      cleanHeight: size.height,
      media: "pending",
      warnings: [],
    };
    await writeMeta(config, meta);
    return meta;
  } catch (err) {
    await rm(target, { force: true });
    if (!(err instanceof AppError)) console.error("[tapes] upload failed", err);
    throw err instanceof AppError ? err : new AppError("invalid_video", 400);
  }
}

async function writeMeta(config: Config, meta: TapeMeta) {
  await writeStored(config, "uploads", `${meta.id}.json`, Buffer.from(JSON.stringify(meta)));
}

export async function readTapeMeta(config: Config, id: string): Promise<TapeMeta | null> {
  if (!UUID.test(id)) return null;
  const raw = await readStored(config, "uploads", `${id}.json`);
  const meta = raw ? (JSON.parse(raw.toString("utf8")) as { kind?: string }) : null;
  return meta?.kind === "tape" ? (meta as TapeMeta) : null;
}

/** Proxy + filmstrip runs per tape, so a poll after a restart starts it again, never twice at once. */
const running = new Map<string, Promise<void>>();

/** Makes the proxy and the filmstrip if they are still pending (idempotent; returns at once). */
export function ensureTapeMedia(config: Config, meta: TapeMeta): void {
  if (meta.media !== "pending" || running.has(meta.id)) return;
  const task = (async () => {
    try {
      await proxy(tapeFile(config, meta), proxyFile(config, meta.id));
      await filmstrip(tapeFile(config, meta), meta.info.seconds, STRIP_COUNT, STRIP_HEIGHT, stripFile(config, meta.id));
      await writeMeta(config, { ...meta, media: "ready" });
    } catch (err) {
      console.error(`[tapes] proxy of ${meta.id} failed`, err);
      await writeMeta(config, { ...meta, media: "failed" });
    } finally {
      running.delete(meta.id);
    }
  })();
  running.set(meta.id, task);
}

/** The filmstrip's layout, for the editor to cut it into thumbnails. */
export const STRIP = { count: STRIP_COUNT, height: STRIP_HEIGHT };

/**
 * One frame at `seconds`: the original (square pixels) and the cleanup with each color, made once
 * per point and kept with the upload. Returns the millisecond key of the files.
 */
export async function previewTape(config: Config, meta: TapeMeta, seconds: number): Promise<number> {
  const at = Math.min(Math.max(seconds, 0), Math.max(meta.info.seconds - 0.1, 0));
  const ms = Math.round(at * 1000);
  const source = tapeFile(config, meta);
  await Promise.all(
    PREVIEW_CHOICES.map(async (choice) => {
      const out = previewFile(config, meta.id, ms, choice);
      if (await stat(out).then(() => true, () => false)) return;
      if (choice !== "original") return previewFrame(source, meta.info, meta.measurements, choice, at, PREVIEW_WIDTH, out);
      const height = Math.round((PREVIEW_WIDTH * meta.info.height) / (meta.info.width * meta.info.sar) / 2) * 2;
      return ffmpeg([
        "-ss", at.toFixed(3), "-i", source, "-map", "0:v:0", "-vf", `scale=${PREVIEW_WIDTH}:${height},setsar=1`,
        "-frames:v", "1", "-q:v", "3", out,
      ]);
    }),
  );
  return ms;
}
