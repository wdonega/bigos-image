import { ComfyClient } from "@/lib/comfy/client";
import { getConfig } from "@/lib/config";
import { pingQueue } from "@/lib/jobs/queue";

export async function GET() {
  const config = getConfig();
  const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: "health", timeoutMs: 5_000 });
  const [comfy, queue] = await Promise.all([
    client.systemStats().then(
      () => true,
      () => false,
    ),
    pingQueue(),
  ]);
  return Response.json({ comfy, queue }, { status: comfy && queue ? 200 : 503 });
}
