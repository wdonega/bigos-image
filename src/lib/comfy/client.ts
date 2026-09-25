import type { ApiGraph } from "../workflow/graph.ts";

export type ComfyErrorKind = "unavailable" | "rejected" | "failed" | "interrupted" | "timeout";

export class ComfyError extends Error {
  readonly kind: ComfyErrorKind;
  readonly details: unknown;

  constructor(kind: ComfyErrorKind, message: string, details?: unknown) {
    super(message);
    this.name = "ComfyError";
    this.kind = kind;
    this.details = details;
  }
}

export type ImageRef = { filename: string; subfolder: string; type: string };

export type HistoryEntry = {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: [string, Record<string, unknown>][];
  };
  outputs?: Record<string, { images?: ImageRef[] }>;
};

export type ComfyClientOptions = {
  baseUrl: string;
  clientId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type QueueItem = [number, string, ...unknown[]];

/** Per-try limit while waiting for ComfyUI to wake, and pause between tries. */
const WAKE_ATTEMPT_MS = 10_000;
const WAKE_RETRY_MS = 2_000;

/** HTTP side of the ComfyUI API. Only the backend talks to ComfyUI (spec §12). */
export class ComfyClient {
  readonly baseUrl: string;
  readonly clientId: string;
  #fetch: typeof fetch;
  #timeoutMs: number;

  constructor(options: ComfyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.clientId = options.clientId;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 60_000;
  }

  async #request(path: string, init?: RequestInit, timeoutMs = this.#timeoutMs): Promise<Response> {
    try {
      return await this.#fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ComfyError("unavailable", `ComfyUI unreachable (${path}): ${String(err)}`);
    }
  }

  async #json<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const res = await this.#request(path, init, timeoutMs);
    if (!res.ok) {
      const kind = res.status >= 500 ? "unavailable" : "rejected";
      throw new ComfyError(kind, `ComfyUI ${path} → HTTP ${res.status}`, await res.text());
    }
    return (await res.json()) as T;
  }

  systemStats(timeoutMs?: number): Promise<Record<string, unknown>> {
    return this.#json("/system_stats", undefined, timeoutMs);
  }

  /**
   * The ComfyUI machine sleeps and is woken on LAN by the first request, taking ~10 s to answer
   * (spec §14, decision 25). Retries /system_stats until it answers or `waitMs` runs out.
   */
  async waitUntilAwake(
    waitMs: number,
    { now = Date.now, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
  ): Promise<boolean> {
    const deadline = now() + waitMs;
    for (;;) {
      const left = deadline - now();
      if (left <= 0) return false;
      try {
        await this.systemStats(Math.min(WAKE_ATTEMPT_MS, left));
        return true;
      } catch {
        const pause = Math.min(WAKE_RETRY_MS, deadline - now());
        if (pause <= 0) return false;
        await sleep(pause);
      }
    }
  }

  objectInfo(nodeClass: string): Promise<Record<string, unknown>> {
    return this.#json(`/object_info/${encodeURIComponent(nodeClass)}`);
  }

  async queuePrompt(graph: ApiGraph): Promise<string> {
    const res = await this.#request("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: this.clientId }),
    });
    const body = (await res.json().catch(() => null)) as { prompt_id?: string } | null;
    if (!res.ok || !body?.prompt_id) {
      const kind = res.status >= 500 ? "unavailable" : "rejected";
      throw new ComfyError(kind, `ComfyUI rejected the prompt (HTTP ${res.status})`, body);
    }
    return body.prompt_id;
  }

  async history(promptId: string): Promise<HistoryEntry | null> {
    const body = await this.#json<Record<string, HistoryEntry>>(
      `/history/${encodeURIComponent(promptId)}`,
    );
    return body[promptId] ?? null;
  }

  /** 0 = running now, N = N-th in line, null = not in ComfyUI's queue. */
  async queuePosition(promptId: string): Promise<number | null> {
    const q = await this.#json<{ queue_running: QueueItem[]; queue_pending: QueueItem[] }>(
      "/queue",
    );
    if (q.queue_running.some((item) => item[1] === promptId)) return 0;
    const pending = [...q.queue_pending].sort((a, b) => a[0] - b[0]);
    const index = pending.findIndex((item) => item[1] === promptId);
    return index === -1 ? null : index + 1;
  }

  async uploadImage(data: Buffer, filename: string): Promise<string> {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(data)], { type: "image/png" }), filename);
    form.append("overwrite", "true");
    const body = await this.#json<{ name: string; subfolder?: string }>("/upload/image", {
      method: "POST",
      body: form,
    });
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  async view(ref: ImageRef): Promise<Buffer> {
    const query = new URLSearchParams(ref).toString();
    const res = await this.#request(`/view?${query}`);
    if (!res.ok) throw new ComfyError("unavailable", `ComfyUI /view → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async interrupt(promptId: string): Promise<void> {
    await this.#request("/interrupt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt_id: promptId }),
    });
  }

  async removeFromQueue(promptId: string): Promise<void> {
    await this.#request("/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delete: [promptId] }),
    });
  }

  wsUrl(): string {
    const url = new URL("/ws", this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("clientId", this.clientId);
    return url.toString();
  }
}
