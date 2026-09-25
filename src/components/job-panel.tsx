"use client";

import { DownloadIcon, ImageIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobView } from "@/lib/client/api";
import { cn } from "@/lib/utils";

function statusText(view: JobView | null): string {
  if (!view) return "Enviando…";
  switch (view.status) {
    case "queued":
      return view.ahead > 0
        ? `Na fila: ${view.ahead} ${view.ahead === 1 ? "geração" : "gerações"} na sua frente.`
        : "Na fila. Começa em instantes.";
    case "waiting":
      return view.ahead
        ? `Aguardando o gerador: ${view.ahead} na sua frente.`
        : "Preparando o gerador…";
    case "running":
      return view.progress === null ? "Gerando…" : `Gerando… ${Math.round(view.progress * 100)}%`;
    default:
      return "";
  }
}

export function JobPanel({
  jobId,
  view,
  onCancel,
  cancelling,
}: {
  jobId: string | null;
  view: JobView | null;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const busy = jobId !== null && (view === null || ["queued", "waiting", "running"].includes(view.status));

  return (
    <div className="flex min-h-80 flex-col gap-3">
      {view?.status === "done" ? (
        <>
          <div
            className={cn(
              "flex items-center justify-center overflow-hidden rounded-xl border",
              view.transparent ? "bg-checkerboard" : "bg-muted/40",
            )}
          >
            {/* Our API serves the original PNG (alpha included); next/image would re-encode it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={view.imageUrl}
              alt="Imagem gerada"
              width={view.width}
              height={view.height}
              className="h-auto max-h-[70vh] w-auto max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {view.width} × {view.height} px · PNG{view.transparent ? " com fundo transparente" : ""}
            </span>
            <Button asChild>
              <a href={`${view.imageUrl}?download`} download>
                <DownloadIcon aria-hidden /> Baixar PNG
              </a>
            </Button>
          </div>
          {view.warnings.map((w) => (
            <p key={w} className="text-sm text-muted-foreground">
              {w}
            </p>
          ))}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center">
          {busy ? (
            <>
              <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm" aria-live="polite">
                {statusText(view)}
              </p>
              <Progress
                value={view?.status === "running" && view.progress !== null ? view.progress * 100 : null}
                className="w-full max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
                <XIcon aria-hidden /> Cancelar
              </Button>
            </>
          ) : view?.status === "cancelled" ? (
            <p className="text-sm text-muted-foreground">Geração cancelada.</p>
          ) : (
            <>
              <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Sua imagem aparece aqui.</p>
            </>
          )}
        </div>
      )}

      {view?.status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>Não deu certo</AlertTitle>
          <AlertDescription>{view.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
