import { stat } from "node:fs/promises";
import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { fileResponse } from "@/lib/jobs/media-response";
import { proxyFile, readTapeMeta } from "@/lib/tapes";

// The light H.264 copy the browser plays in the trim editor, with byte ranges for seeking.
export async function GET(request: Request, ctx: RouteContext<"/api/restore/uploads/[id]/proxy">) {
  try {
    const config = getConfig();
    const meta = await readTapeMeta(config, (await ctx.params).id);
    if (meta?.media !== "ready") throw new AppError("upload_not_found", 404);
    const file = proxyFile(config, meta.id);
    const size = (await stat(file)).size;
    return fileResponse(request, file, size, "video/mp4", `${meta.id}-proxy.mp4`);
  } catch (err) {
    return errorResponse(err);
  }
}
