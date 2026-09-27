// Browser-side calls to our API. The browser never talks to ComfyUI (spec §12).
import type { Detail } from "@/lib/errors";
import type { JobView } from "@/lib/jobs/queue";

export type { Detail, JobView };

export const TERMINAL: ReadonlySet<JobView["status"]> = new Set(["done", "failed", "cancelled"]);

/** An API failure: `code` is translated by the UI (errors.*), `details` too (details.*). */
export class ApiError extends Error {
  readonly code: string;
  readonly details: Detail[];

  constructor(code: string, details: Detail[] = []) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("offline");
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; details?: Detail[] } })
    | null;
  if (!res.ok || !body) throw new ApiError(body?.error?.code ?? "unexpected", body?.error?.details ?? []);
  return body;
}

export async function createJob(request: unknown): Promise<string> {
  const body = await send<{ job_id: string }>("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return body.job_id;
}

export function cancelJob(jobId: string): Promise<JobView> {
  return send<JobView>(`/api/jobs/${jobId}`, { method: "DELETE" });
}

export type UploadedImage = {
  id: string;
  width: number;
  height: number;
  /** Size of what ComfyUI will receive after the backend resized/cropped it. */
  sentWidth: number;
  sentHeight: number;
  warnings: Detail[];
};

export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  return send<UploadedImage>("/api/uploads", { method: "POST", body: form });
}

export type Enhanced = { text: string };

export type EnhanceKind = "image" | "video" | "music";

export function enhancePrompt(prompt: string, locale: string, kind: EnhanceKind = "image"): Promise<Enhanced> {
  return send<Enhanced>("/api/enhance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, locale, kind }),
  });
}

/** "Create lyrics for me": lyrics with section tags, in the user's language. */
export async function writeLyrics(prompt: string, locale: string, genre: string | null): Promise<string> {
  const body = await send<{ lyrics: string }>("/api/lyrics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, locale, genre }),
  });
  return body.lyrics;
}
