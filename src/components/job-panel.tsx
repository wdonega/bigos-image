"use client";

import { DownloadIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CatSad, CatSleeping, CatWatching } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { JobView } from "@/lib/client/api";
import { cn } from "@/lib/utils";

function statusText(view: JobView | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (!view) return t("job.sending");
  switch (view.status) {
    case "queued":
      if (view.ahead === 0) return t("job.queuedNow");
      return view.ahead === 1 ? t("job.queuedOne") : t("job.queuedOther", { count: view.ahead });
    case "waiting":
      return view.ahead ? t("job.waitingAhead", { count: view.ahead }) : t("job.preparing");
    case "running":
      return view.progress === null
        ? t("job.running")
        : t("job.runningPercent", { percent: Math.round(view.progress * 100) });
    default:
      return "";
  }
}

/** Big centered message used by every state except the result. */
function PanelState({
  cat,
  title,
  hint,
  children,
  role,
}: {
  cat: ReactNode;
  title: string;
  hint?: string;
  children?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      {cat}
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-xl font-medium">{title}</p>
        {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function JobPanel({
  jobId,
  view,
  onCancel,
  onRetry,
  cancelling,
  emptyHint,
  emptyTitle,
  runningHint,
}: {
  jobId: string | null;
  view: JobView | null;
  onCancel: () => void;
  onRetry: () => void;
  cancelling: boolean;
  emptyHint: string;
  /** Defaults to "Your image appears here." */
  emptyTitle?: string;
  /** Shown while generating (a video takes minutes). */
  runningHint?: string;
}) {
  const { t, detail } = useI18n();
  const busy = jobId !== null && (view === null || ["queued", "waiting", "running"].includes(view.status));
  const progress = view?.status === "running" ? view.progress : null;
  const panel = useRef<HTMLDivElement>(null);
  // The result fades in once the image has loaded, not when the status changes (no empty frame).
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // On phones the panel sits below a long form: bring it into view when a job starts.
  useEffect(() => {
    if (jobId && window.matchMedia("(max-width: 1023px)").matches) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [jobId]);

  return (
    <div
      ref={panel}
      className="flex min-h-96 scroll-mt-4 flex-col overflow-hidden rounded-3xl border bg-card/60 lg:min-h-[36rem]"
    >
      {view?.status === "done" ? (
        <div
          className={cn(
            "flex flex-1 flex-col gap-3 p-4 sm:p-5",
            loadedUrl === view.url ? "result-in" : "opacity-0",
          )}
        >
          <div
            className={cn(
              "flex flex-1 items-center justify-center overflow-hidden rounded-2xl",
              view.transparent ? "bg-checkerboard" : "bg-muted/40",
            )}
          >
            {view.media === "video" ? (
              <video
                src={view.url}
                controls
                playsInline
                preload="metadata"
                width={view.width}
                height={view.height}
                onLoadedData={() => setLoadedUrl(view.url)}
                aria-label={t("job.resultVideoAlt")}
                className="h-auto max-h-[70vh] w-auto max-w-full bg-black object-contain"
              />
            ) : (
              <>
                {/* Our API serves the original PNG (alpha included); next/image would re-encode it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={view.url}
                  alt={t("job.resultAlt")}
                  width={view.width}
                  height={view.height}
                  onLoad={() => setLoadedUrl(view.url)}
                  className="h-auto max-h-[70vh] w-auto max-w-full object-contain"
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t(view.media === "video" ? "job.resultInfoVideo" : view.transparent ? "job.resultInfoTransparent" : "job.resultInfo", {
                width: view.width,
                height: view.height,
              })}
            </span>
            <Button asChild className="h-11 rounded-xl px-4 sm:h-10">
              <a href={`${view.url}?download`} download>
                <DownloadIcon aria-hidden /> {t(view.media === "video" ? "job.downloadVideo" : "job.download")}
              </a>
            </Button>
          </div>
          {view.warnings.map((w) => (
            <p key={typeof w === "string" ? w : w.code} className="text-sm text-muted-foreground">
              {detail("warnings", w)}
            </p>
          ))}
        </div>
      ) : busy ? (
        <PanelState
          role="status"
          cat={<CatWatching progress={progress} className="w-48 text-foreground/80" />}
          title={statusText(view, t)}
          hint={runningHint}
        >
          <div
            role="progressbar"
            aria-label={t("job.running")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
            className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={onCancel} disabled={cancelling}>
            <XIcon aria-hidden /> {t("job.cancel")}
          </Button>
        </PanelState>
      ) : view?.status === "failed" ? (
        <PanelState
          role="alert"
          cat={<CatSad className="text-muted-foreground" />}
          title={t("job.failedTitle")}
          hint={t(`errors.${view.error.code}`)}
        >
          <Button className="h-10 rounded-xl px-4" onClick={onRetry}>
            <RotateCcwIcon aria-hidden /> {t("job.retry")}
          </Button>
        </PanelState>
      ) : (
        <PanelState
          cat={<CatSleeping className="text-muted-foreground/70" />}
          title={view?.status === "cancelled" ? t("job.cancelled") : (emptyTitle ?? t("job.empty"))}
          hint={emptyHint}
        />
      )}
    </div>
  );
}
