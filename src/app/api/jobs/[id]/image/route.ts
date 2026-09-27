import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { getJobView } from "@/lib/jobs/queue";
import { resultName } from "@/lib/jobs/worker";
import { readStored } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/image">) {
  try {
    const { id } = await ctx.params;
    const view = await getJobView(id);
    if (view?.status !== "done" || view.media !== "image") throw new AppError("job_not_found", 404);
    const png = await readStored(getConfig(), "results", resultName(id));
    if (!png) throw new AppError("job_not_found", 404);

    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="bigos-${id}.png"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
