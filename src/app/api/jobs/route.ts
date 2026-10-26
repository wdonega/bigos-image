import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { type JobView, enqueue, getJobView } from "@/lib/jobs/queue";
import { jobRequestSchema, planJob } from "@/lib/jobs/request";
import { readUploadMeta } from "@/lib/uploads";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = jobRequestSchema.safeParse(body);
    if (!parsed.success) throw new AppError("invalid_request", 400);
    const config = getConfig();
    const plan = await planJob(parsed.data, config, (id) => readUploadMeta(config, id));
    const jobId = await enqueue(plan);
    return Response.json({ job_id: jobId }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Job ids are BullMQ's counters. */
const ID = /^\d+$/;

/**
 * State of several jobs at once, for the jobs menu (spec §14, decision 33): `?ids=1,2,3`. A job
 * the server no longer has (past the retention window) comes back as null.
 */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = [...new Set(raw.split(",").filter(Boolean))];
    if (!ids.every((id) => ID.test(id))) throw new AppError("invalid_request", 400);
    const views = await Promise.all(ids.map((id) => getJobView(id)));
    const jobs: Record<string, JobView | null> = Object.fromEntries(ids.map((id, i) => [id, views[i]]));
    return Response.json({ jobs });
  } catch (err) {
    return errorResponse(err);
  }
}
