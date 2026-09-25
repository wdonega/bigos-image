import { AppError, ERROR_MESSAGES } from "@/lib/errors";
import { type JobView, TERMINAL_STATUSES, getJobView } from "@/lib/jobs/queue";

const POLL_MS = 700;

// Server-Sent Events: pushes the job view whenever it changes, until it is done/failed/cancelled.
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/events">) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (view: JobView) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(view)}\n\n`));
      let last = "";
      try {
        while (!request.signal.aborted) {
          const view: JobView = (await getJobView(id)) ?? {
            id,
            status: "failed",
            error: { code: "job_not_found", message: ERROR_MESSAGES.job_not_found },
          };
          const json = JSON.stringify(view);
          if (json !== last) {
            send(view);
            last = json;
          }
          if (TERMINAL_STATUSES.has(view.status)) break;
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch (err) {
        const code = err instanceof AppError ? err.code : "unexpected";
        send({ id, status: "failed", error: { code, message: ERROR_MESSAGES[code] } });
      }
      try {
        controller.close();
      } catch {
        // client already gone
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
