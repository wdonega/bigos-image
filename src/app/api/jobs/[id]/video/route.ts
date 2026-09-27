import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { parseRange } from "@/lib/http-range";
import { getJobView } from "@/lib/jobs/queue";
import { resultName } from "@/lib/jobs/worker";
import { storageFile } from "@/lib/storage";

// The generated MP4, streamed with byte ranges so every browser (Safari/iOS included) can play
// and seek it.
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/video">) {
  try {
    const { id } = await ctx.params;
    const view = await getJobView(id);
    if (view?.status !== "done" || view.media !== "video") throw new AppError("job_not_found", 404);
    const file = storageFile(getConfig(), "results", resultName(id, "video"));
    const size = await stat(file).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) throw new AppError("job_not_found", 404);

    const download = new URL(request.url).searchParams.has("download");
    const headers: Record<string, string> = {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="bigos-${id}.mp4"`,
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
  } catch (err) {
    return errorResponse(err);
  }
}
