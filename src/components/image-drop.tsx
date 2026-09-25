"use client";

import { ImageUpIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_TYPES, type UploadItem } from "@/hooks/use-uploads";

/** Single image picker for the Editar screen. */
export function ImageDrop({
  item,
  onFile,
  disabled,
}: {
  item: UploadItem | undefined;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {!item ? (
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <ImageUpIcon className="size-8" aria-hidden />
          <span className="font-medium text-foreground">Escolha ou arraste uma imagem</span>
          <span>PNG, JPG ou WebP</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative flex max-h-72 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={item.previewUrl} alt="Imagem a editar" className="max-h-72 w-auto object-contain" />
            {item.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <LoaderCircleIcon className="size-6 animate-spin" aria-label="Enviando" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {item.upload ? `Imagem: ${item.upload.width} × ${item.upload.height} px` : "Enviando…"}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-10 sm:h-7" onClick={pick} disabled={disabled}>
              <RefreshCwIcon aria-hidden /> Trocar imagem
            </Button>
          </div>
          {item.status === "error" && <p className="text-sm text-destructive">{item.error}</p>}
          {item.upload?.warnings.map((w) => (
            <p key={w} className="text-xs text-muted-foreground">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
