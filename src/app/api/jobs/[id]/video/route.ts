import { errorResponse } from "@/lib/errors";
import { mediaResponse } from "@/lib/jobs/media-response";

// The generated MP4, streamed with byte ranges (Safari/iOS play and seek it only that way).
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/video">) {
  try {
    const { id } = await ctx.params;
    return await mediaResponse(request, id, "video");
  } catch (err) {
    return errorResponse(err);
  }
}
