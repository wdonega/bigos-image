"use client";

import { ImageUpIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_TYPES, type UploadItem } from "@/hooks/use-uploads";
import { useI18n } from "@/i18n/provider";

/** Single image picker for the Edit screen. */
export function ImageDrop({
  item,
  onFile,
  disabled,
}: {
  item: UploadItem | undefined;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const { t, detail } = useI18n();
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
          <span className="font-medium text-foreground">{t("imageDrop.choose")}</span>
          <span>{t("imageDrop.formats")}</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative flex max-h-72 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={item.previewUrl} alt={t("imageDrop.previewAlt")} className="max-h-72 w-auto object-contain" />
            {item.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <LoaderCircleIcon className="size-6 animate-spin" aria-label={t("imageDrop.uploading")} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {item.upload
                ? t("imageDrop.size", { width: item.upload.width, height: item.upload.height })
                : t("imageDrop.uploading")}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-10 sm:h-7" onClick={pick} disabled={disabled}>
              <RefreshCwIcon aria-hidden /> {t("imageDrop.replace")}
            </Button>
          </div>
          {item.status === "error" && <p className="text-sm text-destructive">{t(`errors.${item.error}`)}</p>}
          {item.upload?.warnings.map((w) => (
            <p key={typeof w === "string" ? w : w.code} className="text-xs text-muted-foreground">
              {detail("warnings", w)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
