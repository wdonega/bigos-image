import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { enqueue } from "@/lib/jobs/queue";
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
