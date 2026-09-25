"use client";

import { DownloadIcon, ImageIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  const { t, detail } = useI18n();
  const busy = jobId !== null && (view === null || ["queued", "waiting", "running"].includes(view.status));
  const panel = useRef<HTMLDivElement>(null);

  // On phones the panel sits below a long form: bring it into view when a job starts.
  useEffect(() => {
    if (jobId && window.matchMedia("(max-width: 1023px)").matches) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [jobId]);

  return (
    <div ref={panel} className="flex min-h-80 scroll-mt-4 flex-col gap-3">
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
              alt={t("job.resultAlt")}
              width={view.width}
              height={view.height}
              className="h-auto max-h-[70vh] w-auto max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t(view.transparent ? "job.resultInfoTransparent" : "job.resultInfo", {
                width: view.width,
                height: view.height,
              })}
            </span>
            <Button asChild className="h-11 sm:h-8">
              <a href={`${view.imageUrl}?download`} download>
                <DownloadIcon aria-hidden /> {t("job.download")}
              </a>
            </Button>
          </div>
          {view.warnings.map((w) => (
            <p key={typeof w === "string" ? w : w.code} className="text-sm text-muted-foreground">
              {detail("warnings", w)}
            </p>
          ))}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center">
          {busy ? (
            <>
              <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm" aria-live="polite">
                {statusText(view, t)}
              </p>
              <Progress
                value={view?.status === "running" && view.progress !== null ? view.progress * 100 : null}
                className="w-full max-w-xs"
              />
              <Button variant="outline" size="sm" className="h-10 sm:h-7" onClick={onCancel} disabled={cancelling}>
                <XIcon aria-hidden /> {t("job.cancel")}
              </Button>
            </>
          ) : view?.status === "cancelled" ? (
            <p className="text-sm text-muted-foreground">{t("job.cancelled")}</p>
          ) : (
            <>
              <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("job.empty")}</p>
            </>
          )}
        </div>
      )}

      {view?.status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>{t("job.failedTitle")}</AlertTitle>
          <AlertDescription>{t(`errors.${view.error.code}`)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
