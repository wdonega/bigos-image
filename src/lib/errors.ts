import type { SizeLimits, SizeProblem } from "./size.ts";

// User-facing messages (pt-BR, no jargon). Codes travel in API responses and job failures.
export const ERROR_MESSAGES = {
  invalid_request: "Confira os campos e tente de novo.",
  invalid_size: "O tamanho escolhido não é aceito.",
  invalid_image: "Não conseguimos abrir essa imagem. Use PNG, JPG ou WebP.",
  image_too_large: "A imagem é grande demais para enviar.",
  too_many_images: "Você adicionou imagens demais.",
  upload_not_found: "Uma das imagens expirou. Adicione-a de novo.",
  not_supported_yet: "Esta opção ainda não está disponível.",
  job_not_found: "Não encontramos essa geração. Ela pode ter expirado.",
  queue_unavailable: "A fila de geração está fora do ar. Tente de novo em alguns minutos.",
  comfy_unavailable: "O gerador de imagens está fora do ar. Tente de novo em alguns minutos.",
  generation_failed: "Não foi possível gerar a imagem. Tente de novo.",
  out_of_memory:
    "A imagem ficou pesada demais para o gerador. Tente um tamanho menor, menos imagens ou qualidade Normal.",
  timeout: "A geração demorou demais e foi interrompida. Tente de novo.",
  cancelled: "Geração cancelada.",
  unexpected: "Algo deu errado. Tente de novo.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(value: string): value is ErrorCode {
  return value in ERROR_MESSAGES;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: string[];

  constructor(code: ErrorCode, status: number, details: string[] = []) {
    super(ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function describeSizeProblems(problems: SizeProblem[], limits: SizeLimits): string[] {
  const megapixels = (limits.maxPixels / (1024 * 1024)).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
  const text: Record<SizeProblem, string> = {
    not_integer: "Largura e altura precisam ser números inteiros.",
    not_multiple: "Largura e altura precisam ser múltiplos de 32.",
    below_min_side: `Cada lado precisa ter pelo menos ${limits.minSide} px.`,
    above_max_pixels: `A imagem pode ter no máximo ${megapixels} megapixels.`,
    aspect_ratio: `Um lado pode ser no máximo ${limits.maxAspectRatio} vezes maior que o outro.`,
  };
  return problems.map((p) => text[p]);
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
    { error: { code: "unexpected", message: ERROR_MESSAGES.unexpected, details: [] } },
    { status: 500 },
  );
}
