import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { ensureTapeMedia, saveTape } from "@/lib/tapes";

// Old video for restoration (spec §14, decision 32): the raw file as the request body (captures can
// be gigabytes; multipart would be read into memory), its name in x-filename (URI-encoded).
export async function PUT(request: Request) {
  try {
    const config = getConfig();
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > config.restore.maxUploadBytes) {
      throw new AppError("video_too_large", 413, [
        { code: "max_video_upload_mb", params: { max: Math.round(config.restore.maxUploadBytes / 1024 / 1024) } },
      ]);
    }
    const name = decodeURIComponent(request.headers.get("x-filename") ?? "");
    if (!request.body || !name) throw new AppError("invalid_video", 400);
    const meta = await saveTape(config, request.body, name);
    ensureTapeMedia(config, meta);
    return Response.json(meta, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
