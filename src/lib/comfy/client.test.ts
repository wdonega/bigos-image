import { describe, expect, it, vi } from "vitest";
import { ComfyClient, ComfyError } from "./client";

function clientWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init),
  );
  const client = new ComfyClient({
    baseUrl: "https://comfy.test/",
    clientId: "c1",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("ComfyClient", () => {
  it("queues a prompt with our client id", async () => {
    const { client, fetchMock } = clientWith(() => Response.json({ prompt_id: "p1" }));
    await expect(client.queuePrompt({})).resolves.toBe("p1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://comfy.test/prompt");
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: {}, client_id: "c1" });
  });

  it("reports rejected prompts with ComfyUI's node errors", async () => {
    const body = { error: { type: "prompt_outputs_failed_validation" }, node_errors: { 3: {} } };
    const { client } = clientWith(() => Response.json(body, { status: 400 }));
    const err = await client.queuePrompt({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ComfyError);
    expect(err).toMatchObject({ kind: "rejected", details: body });
  });

  it("turns network failures into 'unavailable'", async () => {
    const { client } = clientWith(() => {
      throw new TypeError("fetch failed");
    });
    await expect(client.history("p1")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("reads the queue position", async () => {
    const queue = {
      queue_running: [[5, "running"]],
      queue_pending: [
        [9, "p-late"],
        [7, "p-early"],
      ],
    };
    const { client } = clientWith(() => Response.json(queue));
    await expect(client.queuePosition("running")).resolves.toBe(0);
    await expect(client.queuePosition("p-early")).resolves.toBe(1);
    await expect(client.queuePosition("p-late")).resolves.toBe(2);
    await expect(client.queuePosition("gone")).resolves.toBeNull();
  });

  it("returns null history for unknown prompts", async () => {
    const { client } = clientWith(() => Response.json({}));
    await expect(client.history("p1")).resolves.toBeNull();
  });

  it("builds the WebSocket URL from the base URL", () => {
    const { client } = clientWith(() => Response.json({}));
    expect(client.wsUrl()).toBe("wss://comfy.test/ws?clientId=c1");
  });
});
