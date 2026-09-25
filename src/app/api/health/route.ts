import { ComfyClient } from "@/lib/comfy/client";
import { getConfig } from "@/lib/config";
import { pingQueue } from "@/lib/jobs/queue";

// Waits up to COMFY_WAKE_SECONDS: the ComfyUI machine sleeps and the first request wakes it
// (~10 s). Meanwhile the page shows "Connecting…".
export async function GET() {
  const config = getConfig();
  const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: "health" });
  const [comfy, queue] = await Promise.all([client.waitUntilAwake(config.comfyWakeMs), pingQueue()]);
  return Response.json({ comfy, queue }, { status: comfy && queue ? 200 : 503 });
}
