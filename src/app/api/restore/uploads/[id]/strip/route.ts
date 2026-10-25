import { readFile } from "node:fs/promises";
import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { readTapeMeta, stripFile } from "@/lib/tapes";

// The filmstrip (thumbnails side by side) under the trim editor.
export async function GET(_request: Request, ctx: RouteContext<"/api/restore/uploads/[id]/strip">) {
  try {
    const config = getConfig();
    const meta = await readTapeMeta(config, (await ctx.params).id);
    if (meta?.media !== "ready") throw new AppError("upload_not_found", 404);
    const jpeg = await readFile(stripFile(config, meta.id));
    return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch (err) {
    return errorResponse(err);
  }
}
