import { describe, expect, it, vi } from "vitest";
import { ComfyError, type HistoryEntry } from "./client";
import { type ConnectSocket, type RunClient, outputImage, outputVideo, runPrompt } from "./run";

const success: HistoryEntry = {
  status: { status_str: "success", completed: true },
  outputs: { "461": { images: [{ filename: "a.png", subfolder: "", type: "output" }] } },
};

function fakeClient(histories: (HistoryEntry | null)[], positions: (number | null)[] = []) {
  return {
    wsUrl: () => "ws://comfy.test/ws",
    queuePrompt: vi.fn(async () => "p1"),
    history: vi.fn(async () => (histories.length > 1 ? histories.shift()! : histories[0])),
    queuePosition: vi.fn(async () => (positions.length > 0 ? positions.shift()! : 0)),
    interrupt: vi.fn(async () => {}),
    removeFromQueue: vi.fn(async () => {}),
  } satisfies RunClient;
}

const noSocket: ConnectSocket = async () => null;
const base = { timeoutMs: 10_000, pollMs: 1, connect: noSocket };

describe("runPrompt", () => {
  it("polls /history until the prompt succeeds", async () => {
    const client = fakeClient([null, null, success], [2, 1, 0]);
    const onProgress = vi.fn();
    const onPromptId = vi.fn();
    const result = await runPrompt(client, {}, { ...base, onProgress, onPromptId });
    expect(result.promptId).toBe("p1");
    expect(onPromptId).toHaveBeenCalledWith("p1");
    expect(onProgress).toHaveBeenCalledWith({ phase: "waiting", position: 2 });
    expect(outputImage(result.entry, "461").filename).toBe("a.png");
  });

  it("resumes a known prompt without queuing it again", async () => {
    const client = fakeClient([success]);
    await runPrompt(client, {}, { ...base, knownPromptId: "p0" });
    expect(client.queuePrompt).not.toHaveBeenCalled();
    expect(client.history).toHaveBeenCalledWith("p0");
  });

  it("reports execution errors from history", async () => {
    const failed: HistoryEntry = {
      status: {
        status_str: "error",
        completed: false,
        messages: [["execution_error", { node_type: "KSampler", exception_message: "CUDA OOM" }]],
      },
    };
    const client = fakeClient([failed]);
    await expect(runPrompt(client, {}, base)).rejects.toMatchObject({
      kind: "failed",
      message: "KSampler: CUDA OOM",
    });
  });

  it("stops the prompt in ComfyUI when cancelled", async () => {
    const client = fakeClient([null]);
    const controller = new AbortController();
    controller.abort();
    await expect(runPrompt(client, {}, { ...base, signal: controller.signal })).rejects.toMatchObject({
      kind: "interrupted",
    });
    expect(client.removeFromQueue).toHaveBeenCalledWith("p1");
    expect(client.interrupt).toHaveBeenCalledWith("p1");
  });

  it("times out and stops the prompt", async () => {
    const client = fakeClient([null]);
    await expect(runPrompt(client, {}, { ...base, timeoutMs: 0 })).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(client.interrupt).toHaveBeenCalled();
  });

  it("forwards WebSocket progress", async () => {
    let push: (raw: unknown) => void = () => {};
    const connect: ConnectSocket = async (_url, onMessage) => {
      push = onMessage;
      return { close: vi.fn() };
    };
    const client = fakeClient([null, null, success]);
    client.history.mockImplementationOnce(async () => {
      push(JSON.stringify({ type: "progress", data: { prompt_id: "p1", value: 5, max: 25 } }));
      return null;
    });
    const onProgress = vi.fn();
    await runPrompt(client, {}, { ...base, connect, onProgress });
    expect(onProgress).toHaveBeenCalledWith({ phase: "running", value: 5, max: 25 });
  });
});

describe("runPrompt — ComfyUI briefly unreachable", () => {
  const blip = () => Promise.reject(new ComfyError("unavailable", "ComfyUI unreachable (/history/p1): fetch failed"));

  it("keeps polling through a short outage when outageMs allows it", async () => {
    const client = fakeClient([success]);
    client.history.mockImplementationOnce(blip).mockImplementationOnce(blip);
    const result = await runPrompt(client, {}, { ...base, outageMs: 60_000 });
    expect(result.entry).toBe(success);
    expect(client.history).toHaveBeenCalledTimes(3);
  });

  it("fails on the first error without outageMs (old behavior)", async () => {
    const client = fakeClient([success]);
    client.history.mockImplementationOnce(blip);
    await expect(runPrompt(client, {}, base)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("gives up once the outage lasts longer than outageMs", async () => {
    const client = fakeClient([success]);
    client.history.mockImplementation(blip);
    await expect(runPrompt(client, {}, { ...base, outageMs: 5 })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("does not retry other errors", async () => {
    const client = fakeClient([success]);
    client.history.mockImplementationOnce(() => Promise.reject(new Error("bug")));
    await expect(runPrompt(client, {}, { ...base, outageMs: 60_000 })).rejects.toThrow("bug");
  });
});

describe("runPrompt — prompt dropped by a ComfyUI restart", () => {
  it("fails once the prompt is neither queued nor in history for a few polls", async () => {
    const client = fakeClient([null], [0, null, null, null]);
    await expect(runPrompt(client, {}, base)).rejects.toMatchObject({ kind: "failed", message: /prompt lost/ });
  });

  it("keeps waiting while the prompt is still queued or running", async () => {
    const client = fakeClient([null, null, null, null, success], [2, 1, 0, 0]);
    const result = await runPrompt(client, {}, base);
    expect(result.entry).toBe(success);
  });
});

describe("outputImage", () => {
  it("fails clearly when the save node produced nothing", () => {
    expect(() => outputImage({ outputs: {} }, "461")).toThrow(/No image/);
  });
});

describe("outputVideo", () => {
  const file = { filename: "v.mp4", subfolder: "ltx23", type: "output" };

  it("reads VHS_VideoCombine videos under gifs", () => {
    expect(outputVideo({ outputs: { "9": { gifs: [file] } } }, "9")).toEqual(file);
  });

  it("reads SaveVideo videos under images when animated, with their metadata", () => {
    const saved = { ...file, metadata: { width: 928, height: 544, duration: 4.7 } };
    expect(outputVideo({ outputs: { "9": { images: [saved], animated: [true] } } }, "9")).toEqual(saved);
  });

  it("does not take a still image for a video", () => {
    expect(() => outputVideo({ outputs: { "9": { images: [file] } } }, "9")).toThrow(/No video/);
  });
});
