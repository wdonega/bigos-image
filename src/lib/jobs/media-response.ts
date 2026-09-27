import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getConfig } from "../config.ts";
import { AppError } from "../errors.ts";
import { parseRange } from "../http-range.ts";
import { type Media, getJobView } from "./queue.ts";
import { resultName } from "./worker.ts";
import { storageFile } from "../storage.ts";

const TYPES: Record<Exclude<Media, "image">, { mime: string; ext: string }> = {
  video: { mime: "video/mp4", ext: "mp4" },
  audio: { mime: "audio/mpeg", ext: "mp3" },
};

/**
 * A finished job's video or song, streamed with byte ranges: Safari/iOS only play <video> and
 * <audio> that way, and it lets every browser seek without downloading the whole file.
 */
export async function mediaResponse(request: Request, id: string, media: Exclude<Media, "image">): Promise<Response> {
  const view = await getJobView(id);
  if (view?.status !== "done" || view.media !== media) throw new AppError("job_not_found", 404);
  const file = storageFile(getConfig(), "results", resultName(id, media));
  const size = await stat(file).then(
    (s) => s.size,
    () => null,
  );
  if (size === null) throw new AppError("job_not_found", 404);

  const { mime, ext } = TYPES[media];
  const download = new URL(request.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="bigos-${id}.${ext}"`,
    "cache-control": "private, max-age=3600",
  };
  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
