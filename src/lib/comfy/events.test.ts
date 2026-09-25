import { describe, expect, it } from "vitest";
import { parseComfyMessage } from "./events";

const msg = (type: string, data: Record<string, unknown>) => JSON.stringify({ type, data });

describe("parseComfyMessage", () => {
  it("maps the lifecycle of our prompt", () => {
    expect(parseComfyMessage(msg("execution_start", { prompt_id: "p1" }), "p1")).toEqual({
      type: "started",
    });
    expect(parseComfyMessage(msg("progress", { prompt_id: "p1", value: 3, max: 25 }), "p1")).toEqual(
      { type: "progress", value: 3, max: 25 },
    );
    expect(parseComfyMessage(msg("executing", { prompt_id: "p1", node: null }), "p1")).toEqual({
      type: "finished",
    });
    expect(parseComfyMessage(msg("execution_interrupted", { prompt_id: "p1" }), "p1")).toEqual({
      type: "interrupted",
    });
    expect(
      parseComfyMessage(
        msg("execution_error", { prompt_id: "p1", node_type: "KSampler", exception_message: "OOM" }),
        "p1",
      ),
    ).toEqual({ type: "failed", message: "KSampler: OOM" });
  });

  it("ignores other prompts, running nodes, binary frames and junk", () => {
    expect(parseComfyMessage(msg("progress", { prompt_id: "other", value: 1, max: 2 }), "p1")).toBeNull();
    expect(parseComfyMessage(msg("executing", { prompt_id: "p1", node: "12" }), "p1")).toBeNull();
    expect(parseComfyMessage(new ArrayBuffer(8), "p1")).toBeNull();
    expect(parseComfyMessage("not json", "p1")).toBeNull();
    expect(parseComfyMessage(msg("status", { status: {} }), "p1")).toBeNull();
  });
});
