// Parses ComfyUI WebSocket messages for one prompt. Binary frames (live previews) are ignored.

export type PromptEvent =
  | { type: "started" }
  | { type: "progress"; value: number; max: number }
  | { type: "finished" }
  | { type: "failed"; message: string }
  | { type: "interrupted" };

type Message = { type?: string; data?: Record<string, unknown> };

export function parseComfyMessage(raw: unknown, promptId: string): PromptEvent | null {
  if (typeof raw !== "string") return null;
  let msg: Message;
  try {
    msg = JSON.parse(raw) as Message;
  } catch {
    return null;
  }
  const data = msg.data;
  if (!data || data.prompt_id !== promptId) return null;

  switch (msg.type) {
    case "execution_start":
      return { type: "started" };
    case "progress":
      return { type: "progress", value: Number(data.value), max: Number(data.max) };
    case "execution_success":
      return { type: "finished" };
    case "executing":
      // node === null marks the end of the prompt; the caller confirms the outcome in /history.
      return data.node === null ? { type: "finished" } : null;
    case "execution_error":
      return {
        type: "failed",
        message: `${String(data.node_type ?? "node")}: ${String(data.exception_message ?? "unknown error")}`,
      };
    case "execution_interrupted":
      return { type: "interrupted" };
    default:
      return null;
  }
}
