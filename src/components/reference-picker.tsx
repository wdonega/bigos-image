"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AtSignIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_TYPES, type useUploads } from "@/hooks/use-uploads";
import { useI18n } from "@/i18n/provider";

type Uploads = ReturnType<typeof useUploads>;

/** Optional reference images for the Generate screen (spec §4): add, remove, reorder, mention. */
export function ReferencePicker({
  uploads,
  max,
  disabled,
  onMention,
}: {
  uploads: Uploads;
  max: number;
  disabled?: boolean;
  onMention: (n: number) => void;
}) {
  const { t, detail } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const full = uploads.items.length >= max;

  function addFiles(files: File[]) {
    const images = files.filter((f) => ACCEPTED_TYPES.split(",").includes(f.type));
    const skipped = uploads.add(images);
    const wrongType = files.length - images.length;
    setNotice(
      skipped > 0
        ? skipped === 1
          ? t("references.skippedOne", { max })
          : t("references.skippedOther", { max, count: skipped })
        : wrongType > 0
          ? t("references.wrongType")
          : null,
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled) addFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("references.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("references.counter", { count: uploads.items.length, max })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 sm:h-7"
          disabled={disabled || full}
          onClick={() => input.current?.click()}
        >
          <ImagePlusIcon aria-hidden /> {t("references.add")}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.items.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2">
          {uploads.items.map((item, index) => (
            <li key={item.key} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={item.previewUrl} alt={t("references.label", { n: index + 1 })} className="size-full object-cover" />
                {item.status === "uploading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <LoaderCircleIcon className="size-5 animate-spin" aria-label={t("references.uploading")} />
                  </div>
                )}
                {item.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-destructive/80 p-1 text-center text-[11px] text-white">
                    {t(`errors.${item.error}`)}
                  </div>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium shadow">
                  {t("references.label", { n: index + 1 })}
                </span>
                <button
                  type="button"
                  className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-background/90 shadow sm:size-6"
                  aria-label={t("references.remove", { n: index + 1 })}
                  disabled={disabled}
                  onClick={() => {
                    uploads.remove(item.key);
                    setNotice(null);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-center">
                <span className="flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-10 sm:size-6"
                    aria-label={t("references.moveLeft", { n: index + 1 })}
                    disabled={disabled || index === 0}
                    onClick={() => uploads.move(item.key, -1)}
                  >
                    <ArrowLeftIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-10 sm:size-6"
                    aria-label={t("references.moveRight", { n: index + 1 })}
                    disabled={disabled || index === uploads.items.length - 1}
                    onClick={() => uploads.move(item.key, 1)}
                  >
                    <ArrowRightIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-10 sm:size-6"
                    aria-label={t("references.mention", { n: index + 1 })}
                    title={t("references.mentionTitle")}
                    disabled={disabled}
                    onClick={() => onMention(index + 1)}
                  >
                    <AtSignIcon />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {uploads.items.some((i) => i.upload?.warnings.length) && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {uploads.items.map((item, index) =>
            item.upload?.warnings.map((w) => (
              <li key={`${item.key}-${typeof w === "string" ? w : w.code}`}>
                {t("references.warning", { n: index + 1, text: detail("warnings", w) })}
              </li>
            )),
          )}
        </ul>
      )}

      {uploads.items.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("references.help")}</p>
      )}

      {notice && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <TriangleAlertIcon className="size-3.5" aria-hidden /> {notice}
        </p>
      )}
    </div>
  );
}
