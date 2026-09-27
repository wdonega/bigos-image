import { errorResponse } from "@/lib/errors";
import { mediaResponse } from "@/lib/jobs/media-response";

// The generated song (MP3), streamed with byte ranges (Safari/iOS play and seek it only that way).
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/audio">) {
  try {
    const { id } = await ctx.params;
    return await mediaResponse(request, id, "audio");
  } catch (err) {
    return errorResponse(err);
  }
}
