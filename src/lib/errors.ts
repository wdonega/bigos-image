import type { SizeLimits, SizeProblem } from "./size.ts";

// The API speaks in codes; the UI translates them (src/i18n, keys errors.* / details.* /
// warnings.*). The English `message` in responses is for logs and developers only.
export const ERROR_CODES = [
  "invalid_request",
  "invalid_size",
  "invalid_image",
  "image_too_large",
  "too_many_images",
  "upload_not_found",
  "not_supported_yet",
  "job_not_found",
  "queue_unavailable",
  "comfy_unavailable",
  "generation_failed",
  "out_of_memory",
  "timeout",
  "cancelled",
  "enhance_unavailable",
  "enhance_failed",
  "unexpected",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** A translatable item: `code` is a message key under details.* or warnings.*. */
export type Detail = { code: string; params?: Record<string, string | number> };

const DEVELOPER_MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "Invalid request",
  invalid_size: "Invalid output size",
  invalid_image: "Unsupported or unreadable image",
  image_too_large: "Image exceeds MAX_UPLOAD_MB",
  too_many_images: "Too many reference images",
  upload_not_found: "Upload not found or expired",
  not_supported_yet: "Not supported yet",
  job_not_found: "Job not found or expired",
  queue_unavailable: "Queue (Redis) unavailable",
  comfy_unavailable: "ComfyUI unavailable",
  generation_failed: "Generation failed",
  out_of_memory: "ComfyUI ran out of GPU memory",
  timeout: "Generation timed out",
  cancelled: "Generation cancelled",
  enhance_unavailable: "Prompt enhancer (LLM) unavailable",
  enhance_failed: "Prompt enhancer returned an unusable reply",
  unexpected: "Unexpected error",
};

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

export function errorMessage(code: ErrorCode): string {
  return DEVELOPER_MESSAGES[code];
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Detail[];

  constructor(code: ErrorCode, status: number, details: Detail[] = []) {
    super(DEVELOPER_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Size problems as translatable details, with the limits the UI needs to explain them. */
export function sizeProblemDetails(problems: SizeProblem[], limits: SizeLimits): Detail[] {
  const params: Partial<Record<SizeProblem, Detail["params"]>> = {
    below_min_side: { min: limits.minSide },
    above_max_pixels: { megapixels: Math.round((limits.maxPixels / (1024 * 1024)) * 10) / 10 },
    aspect_ratio: { ratio: limits.maxAspectRatio },
  };
  return problems.map((code) => (params[code] ? { code, params: params[code] } : { code }));
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  console.error("[api] unexpected error", err);
  return Response.json(
    { error: { code: "unexpected", message: DEVELOPER_MESSAGES.unexpected, details: [] } },
    { status: 500 },
  );
}
