"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLinesIcon, DownloadIcon, FilmIcon, ImageIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useJobKind, useJobs } from "@/components/jobs-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n/provider";
import { type JobView, TERMINAL } from "@/lib/client/api";
import { type JobEntry, jobHref } from "@/lib/client/job-history";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useI18n>["t"];

/** "há 3 min" / "3 min ago", in the user's language. */
function ago(createdAt: number, locale: string): string {
  const minutes = Math.round((Date.now() - createdAt) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return minutes < 60 ? rtf.format(-minutes, "minute") : rtf.format(-Math.round(minutes / 60), "hour");
}

function statusLine(view: JobView | undefined, entry: JobEntry, t: T, locale: string): string {
  if (!view) return t("jobs.status.checking");
  switch (view.status) {
    case "queued":
    case "waiting":
      return view.ahead ? t("jobs.status.queuedAhead", { count: view.ahead }) : t("jobs.status.queued");
    case "running":
      return view.progress === null
        ? t("jobs.status.running")
        : t("jobs.status.runningPercent", { percent: Math.round(view.progress * 100) });
    case "done":
      return t("jobs.status.done", { when: ago(entry.createdAt, locale) });
    case "failed":
      return t("jobs.status.failed");
    case "cancelled":
      return t("jobs.status.cancelled");
  }
}

const STATUS_COLOR: Partial<Record<JobView["status"], string>> = {
  running: "text-primary",
  done: "text-emerald-700 dark:text-emerald-400",
  failed: "text-destructive",
};

/** The header's jobs button and its list (spec §14, decision 33). */
export function JobsMenu() {
  const { t } = useI18n();
  const { entries, views, markAllSeen } = useJobs();
  const [open, setOpen] = useState(false);

  const active = entries.filter((e) => !views[e.id] || !TERMINAL.has(views[e.id].status)).length;
  const unseen = entries.some((e) => !e.seen && (views[e.id]?.status === "done" || views[e.id]?.status === "failed"));

  function change(next: boolean) {
    setOpen(next);
    if (!next) markAllSeen();
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("relative h-10 gap-2 rounded-xl px-3", open && "border-primary bg-secondary")}
          aria-label={active ? t("jobs.buttonActive", { count: active }) : t("jobs.title")}
          title={t("jobs.title")}
        >
          <DownloadIcon />
          <span className="hidden lg:inline">{t("jobs.title")}</span>
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {active}
            </span>
          )}
          {unseen && <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-background bg-emerald-600" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0">
        <JobList onNavigate={() => change(false)} />
      </PopoverContent>
    </Popover>
  );
}

function JobList({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  const { entries, views, clearFinished } = useJobs();
  const finished = entries.some((e) => views[e.id] && TERMINAL.has(views[e.id].status));

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h2 className="font-heading text-base font-bold">{t("jobs.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("jobs.thisDevice")}</span>
      </div>
      {entries.length === 0 ? (
        <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground">{t("jobs.empty")}</p>
      ) : (
        <ul className="max-h-[min(32rem,70vh)] overflow-y-auto">
          {entries.map((entry) => (
            <JobRow key={entry.id} entry={entry} view={views[entry.id]} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      {finished && (
        <div className="flex justify-start border-t px-2 py-1.5">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFinished}>
            {t("jobs.clearFinished")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Thumb({ entry, view }: { entry: JobEntry; view: JobView | undefined }) {
  const box = "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground";
  if (view?.status === "done" && view.media === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- our own result, already sized by the server
    return <img src={view.url} alt="" className={cn(box, "object-cover")} />;
  }
  const Icon = entry.screen === "generate" ? ImageIcon : entry.screen === "music" ? AudioLinesIcon : FilmIcon;
  return (
    <span className={box} aria-hidden>
      <Icon className="size-5" />
    </span>
  );
}

function JobRow({ entry, view, onNavigate }: { entry: JobEntry; view: JobView | undefined; onNavigate: () => void }) {
  const { t, locale } = useI18n();
  const kind = useJobKind();
  const { cancel, retry } = useJobs();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const live = !view || !TERMINAL.has(view.status);
  const fresh = !entry.seen && view?.status === "done";

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
  }

  return (
    <li className={cn("flex gap-3 border-t px-4 py-3", fresh && "bg-emerald-50 dark:bg-emerald-950/30")}>
      <Thumb entry={entry} view={view} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 gap-1.5 text-xs font-semibold">
          <span className="shrink-0 text-muted-foreground">{kind(entry)}</span>
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className={cn("truncate", STATUS_COLOR[view?.status ?? "queued"] ?? "text-muted-foreground")}>
            {statusLine(view, entry, t, locale)}
          </span>
        </p>
        <p className="truncate text-sm font-medium">{entry.label}</p>
        {view?.status === "running" && (
          <Progress
            value={view.progress === null ? 0 : Math.round(view.progress * 100)}
            className="mt-1 h-1.5"
            aria-label={kind(entry)}
          />
        )}
        {view?.status === "failed" && <p className="text-xs text-muted-foreground">{t(`errors.${view.error.code}`)}</p>}
        {view && !live && (
          <div className="mt-1 flex flex-wrap gap-2">
            {view.status === "done" && (
              <>
                <Button asChild size="sm" className="h-8 rounded-full">
                  <Link href={jobHref(entry)} onClick={onNavigate}>
                    {t("jobs.open")}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 rounded-full">
                  <a href={view.url} download>
                    <DownloadIcon />
                    {t("jobs.download")}
                  </a>
                </Button>
              </>
            )}
            {(view.status === "failed" || view.status === "cancelled") && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const id = await retry(entry.id);
                    if (id) {
                      onNavigate();
                      router.push(jobHref({ id, screen: entry.screen }));
                    }
                  })
                }
              >
                <RotateCcwIcon />
                {t("job.retry")}
              </Button>
            )}
          </div>
        )}
      </div>
      {live && view && (
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0 rounded-lg"
          disabled={busy}
          aria-label={t("jobs.cancel", { kind: kind(entry) })}
          title={t("jobs.cancelHint")}
          onClick={() => act(() => cancel(entry.id))}
        >
          <XIcon />
        </Button>
      )}
    </li>
  );
}
