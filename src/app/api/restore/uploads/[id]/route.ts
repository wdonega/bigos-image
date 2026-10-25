import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { ensureTapeMedia, readTapeMeta } from "@/lib/tapes";

// An uploaded old video: its facts and whether the trim editor's proxy is ready (the screen polls).
export async function GET(_request: Request, ctx: RouteContext<"/api/restore/uploads/[id]">) {
  try {
    const config = getConfig();
    const meta = await readTapeMeta(config, (await ctx.params).id);
    if (!meta) throw new AppError("upload_not_found", 404);
    // After a restart a pending proxy has no process behind it: start it again.
    ensureTapeMedia(config, meta);
    return Response.json(meta);
  } catch (err) {
    return errorResponse(err);
  }
}
