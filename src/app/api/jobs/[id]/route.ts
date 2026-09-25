import { AppError, errorResponse } from "@/lib/errors";
import { cancelJob, getJobView } from "@/lib/jobs/queue";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  try {
    const { id } = await ctx.params;
    const view = await getJobView(id);
    if (!view) throw new AppError("job_not_found", 404);
    return Response.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  try {
    const { id } = await ctx.params;
    const view = await cancelJob(id);
    if (!view) throw new AppError("job_not_found", 404);
    return Response.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}
