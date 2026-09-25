// Browser-side calls to our API. The browser never talks to ComfyUI (spec §12).
import type { JobView } from "@/lib/jobs/queue";

export type { JobView };

export const TERMINAL: ReadonlySet<JobView["status"]> = new Set(["done", "failed", "cancelled"]);

export class ApiError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

const OFFLINE = "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.";

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("offline", OFFLINE);
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string; details?: string[] } })
    | null;
  if (!res.ok || !body) {
    const error = body?.error;
    throw new ApiError(error?.code ?? "unexpected", error?.message ?? OFFLINE, error?.details ?? []);
  }
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
  warnings: string[];
};

export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  return send<UploadedImage>("/api/uploads", { method: "POST", body: form });
}
