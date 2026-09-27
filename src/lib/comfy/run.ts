import type { ApiGraph } from "../workflow/graph.ts";
import { ComfyError, type HistoryEntry, type ImageRef } from "./client.ts";
import { type PromptEvent, parseComfyMessage } from "./events.ts";

export type RunProgress =
  | { phase: "waiting"; position: number | null }
  | { phase: "running"; value: number; max: number };

/** The subset of ComfyClient that runPrompt needs (lets tests pass a fake). */
export type RunClient = {
  wsUrl(): string;
  queuePrompt(graph: ApiGraph): Promise<string>;
  history(promptId: string): Promise<HistoryEntry | null>;
  queuePosition(promptId: string): Promise<number | null>;
  interrupt(promptId: string): Promise<void>;
  removeFromQueue(promptId: string): Promise<void>;
};

export type EventSocket = { close(): void };
export type ConnectSocket = (
  url: string,
  onMessage: (raw: unknown) => void,
) => Promise<EventSocket | null>;

export type RunOptions = {
  timeoutMs: number;
  /** Resume a prompt already queued (e.g. after a backend restart) instead of queuing again. */
  knownPromptId?: string;
  onPromptId?: (promptId: string) => Promise<void> | void;
  onProgress?: (progress: RunProgress) => void;
  signal?: AbortSignal;
  pollMs?: number;
  connect?: ConnectSocket;
};

/** Opens the progress WebSocket; returns null if it fails (polling still finishes the job). */
export const connectWebSocket: ConnectSocket = (url, onMessage) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (value: EventSocket | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        done(null);
      }, 10_000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        done(ws);
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        done(null);
      });
      ws.addEventListener("message", (event) => onMessage(event.data));
    } catch {
      done(null);
    }
  });

function isDone(entry: HistoryEntry): boolean {
  const status = entry.status?.status_str;
  return entry.status?.completed === true || status === "success" || status === "error";
}

function failureMessage(entry: HistoryEntry): string {
  const error = entry.status?.messages?.find(([type]) => type === "execution_error")?.[1];
  if (!error) return "execution failed";
  return `${String(error.node_type ?? "node")}: ${String(error.exception_message ?? "unknown error")}`;
}

/**
 * Queues a graph and waits until ComfyUI finishes it. Progress comes from the WebSocket; the
 * outcome is always confirmed in /history, which is also polled in case the socket drops.
 */
export async function runPrompt(
  client: RunClient,
  graph: ApiGraph,
  options: RunOptions,
): Promise<{ promptId: string; entry: HistoryEntry }> {
  const pollMs = options.pollMs ?? 2_000;
  let promptId = options.knownPromptId;
  let started = false;
  let socketFailure: ComfyError | null = null;
  let wake: () => void = () => {};

  const onEvent = (event: PromptEvent) => {
    if (event.type === "started") started = true;
    if (event.type === "progress") {
      started = true;
      options.onProgress?.({ phase: "running", value: event.value, max: event.max });
    }
    if (event.type === "failed") socketFailure = new ComfyError("failed", event.message);
    if (event.type === "interrupted") socketFailure = new ComfyError("interrupted", "interrupted");
    if (event.type !== "progress") wake();
  };

  // Connect before queuing so no event is missed.
  const socket = await (options.connect ?? connectWebSocket)(client.wsUrl(), (raw) => {
    if (!promptId) return;
    const event = parseComfyMessage(raw, promptId);
    if (event) onEvent(event);
  });

  const abort = () => wake();
  options.signal?.addEventListener("abort", abort);

  try {
    if (!promptId) {
      promptId = await client.queuePrompt(graph);
      await options.onPromptId?.(promptId);
    }
    const id = promptId;
    const deadline = Date.now() + options.timeoutMs;

    const stop = async (error: ComfyError) => {
      await client.removeFromQueue(id).catch(() => {});
      await client.interrupt(id).catch(() => {});
      return error;
    };

    for (;;) {
      if (options.signal?.aborted) throw await stop(new ComfyError("interrupted", "cancelled"));

      const entry = await client.history(id);
      if (entry && isDone(entry)) {
        if (entry.status?.status_str === "error") {
          throw new ComfyError("failed", failureMessage(entry), entry.status);
        }
        return { promptId: id, entry };
      }
      if (socketFailure) throw socketFailure;
      if (Date.now() > deadline) throw await stop(new ComfyError("timeout", "timed out"));

      if (!started) {
        const position = await client.queuePosition(id);
        if (position === 0) started = true;
        else options.onProgress?.({ phase: "waiting", position });
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    socket?.close();
  }
}

/** The first image saved by the node with this id (the @save node). */
/** The video written by VHS_VideoCombine, which reports it under `gifs` (spec §14, m5 spike). */
export function outputVideo(entry: HistoryEntry, saveNodeId: string): ImageRef {
  const video = entry.outputs?.[saveNodeId]?.gifs?.[0];
  if (!video) {
    throw new ComfyError("failed", `No video in history outputs of node ${saveNodeId}`, entry.outputs);
  }
  return video;
}

export function outputImage(entry: HistoryEntry, saveNodeId: string): ImageRef {
  const image = entry.outputs?.[saveNodeId]?.images?.[0];
  if (!image) {
    throw new ComfyError("failed", `No image in history outputs of node ${saveNodeId}`, entry.outputs);
  }
  return image;
}
