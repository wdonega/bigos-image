import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "./client";
import { type ConnectSocket, type RunClient, outputImage, runPrompt } from "./run";

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

describe("outputImage", () => {
  it("fails clearly when the save node produced nothing", () => {
    expect(() => outputImage({ outputs: {} }, "461")).toThrow(/No image/);
  });
});
