// Browser-side calls to our API. The browser never talks to ComfyUI (spec §12).
import type { Detail } from "@/lib/errors";
import type { JobView } from "@/lib/jobs/queue";
import type { PreviewChoice, TapeMeta } from "@/lib/tapes";

export type { Detail, JobView, PreviewChoice, TapeMeta };

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

/** State of the jobs the menu lists; null for jobs the server no longer has. */
export async function getJobViews(ids: string[]): Promise<Record<string, JobView | null>> {
  const body = await send<{ jobs: Record<string, JobView | null> }>(`/api/jobs?ids=${ids.map(encodeURIComponent).join(",")}`, {
    cache: "no-store",
  });
  return body.jobs;
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

/**
 * Sends an old video for restoration (spec §14, decision 32) as the raw request body. XHR rather
 * than fetch: it reports upload progress, which matters for captures of hundreds of MB.
 */
export function uploadTape(file: File, onProgress: (share: number) => void): Promise<TapeMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/restore/uploads");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError("offline"));
    xhr.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText) as TapeMeta & { error?: { code: string; details?: Detail[] } };
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else reject(new ApiError(body?.error?.code ?? "video_upload_failed", body?.error?.details ?? []));
    };
    xhr.send(file);
  });
}

export function getTape(id: string): Promise<TapeMeta> {
  return send<TapeMeta>(`/api/restore/uploads/${id}`, { method: "GET" });
}

/** The cleaned frame at `seconds` with each color (and the original), as image URLs. */
export function previewTape(id: string, seconds: number): Promise<{ ms: number; images: Record<PreviewChoice, string> }> {
  return send(`/api/restore/uploads/${id}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seconds }),
  });
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
