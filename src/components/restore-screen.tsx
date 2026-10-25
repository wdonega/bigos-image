"use client";

import { FilmIcon, LoaderCircleIcon, PlayIcon, SquareIcon, XIcon } from "lucide-react";
import { type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { CHOICE_ITEM, Field, SUBMIT_BUTTON } from "@/components/field";
import { FormError } from "@/components/form-error";
import { RestoreIcon } from "@/components/icons";
import { JobPanel } from "@/components/job-panel";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useJobRunner } from "@/hooks/use-job-runner";
import { useI18n } from "@/i18n/provider";
import { ApiError, type PreviewChoice, type TapeMeta, getTape, previewTape, uploadTape } from "@/lib/client/api";
import { COLOR_IDS, type ColorId, RESTORE_MODES, type RestoreMode, estimateLevel, estimateSeconds } from "@/lib/restore";
import type { ScreenLimits } from "@/lib/screen-limits";
import { cn } from "@/lib/utils";

type Limits = ScreenLimits["restore"];
type Translate = ReturnType<typeof useI18n>["t"];

/** Accepted on the file picker (ffmpeg reads them; the server checks again by extension). */
const ACCEPTED = "video/*,.mpg,.mpeg,.vob,.avi,.dv,.mov,.mp4,.m4v,.mkv,.wmv,.3gp,.ts,.m2ts,.flv";
/** How often the screen asks whether the trim editor's proxy is ready. */
const POLL_MS = 1500;
/** Shortest section the backend accepts. */
const MIN_SECTION = 1;

/** Estimate warning styles by level (> 1st, 2nd and 3rd step of RESTORE_WARN_MINUTES), readable in both themes. */
const LEVEL_STYLES = [
  "bg-secondary text-muted-foreground",
  "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  "bg-destructive/15 text-destructive",
];

/** "1 h 50 min", "25 min" or "less than a minute". */
function formatEstimate(seconds: number, t: Translate): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("restore.estimateUnderMinute");
  if (minutes < 60) return t("restore.estimateMinutes", { minutes });
  return t("restore.estimateHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** "1 min", "30 min" or "45 s". */
function formatLimit(seconds: number, t: Translate): string {
  return seconds >= 60 && seconds % 60 === 0
    ? t("restore.limitMinutes", { minutes: seconds / 60 })
    : t("restore.limitSeconds", { seconds });
}

/** Clock time for the trim editor: 1:05.3 */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** Old video restoration (spec §14, decision 32): upload, trim, pick a color, restore. */
export function RestoreScreen({ limits }: { limits: Limits }) {
  const { t } = useI18n();
  const job = useJobRunner();
  const [tape, setTape] = useState<TapeMeta | null>(null);
  const [upload, setUpload] = useState<{ name: string; share: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>("upscale");
  const [color, setColor] = useState<ColorId>("normalize");
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Polls until the proxy and filmstrip are ready (a 1 h tape takes a few minutes).
  useEffect(() => {
    if (!tape || tape.media !== "pending") return;
    const timer = setTimeout(() => {
      getTape(tape.id)
        .then(setTape)
        .catch(() => {});
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [tape]);

  const max = limits.maxSeconds[mode];
  const seconds = Math.max(range[1] - range[0], 0);
  const tooLong = seconds > max + 0.01;
  const estimate = estimateSeconds(seconds, mode, limits.factors);
  const canSubmit = tape !== null && !tooLong && seconds >= MIN_SECTION && !job.busy;

  async function choose(file: File) {
    setUploadError(null);
    setTape(null);
    if (file.size > limits.maxUploadBytes) {
      setUploadError("video_too_large");
      return;
    }
    setUpload({ name: file.name, share: 0 });
    try {
      const meta = await uploadTape(file, (share) => setUpload({ name: file.name, share }));
      setTape(meta);
      setRange([0, Math.min(meta.info.seconds, limits.maxSeconds[mode])]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.code : "video_upload_failed");
    } finally {
      setUpload(null);
    }
  }

  function changeMode(next: RestoreMode) {
    setMode(next);
    // Keep the start; shorten the end when the new mode allows less.
    setRange(([start, end]) => [start, Math.min(end, start + limits.maxSeconds[next])]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !tape) return;
    void job.submit({ screen: "restore", upload: tape.id, start: range[0], end: range[1], color, mode });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <TapePicker
          tape={tape}
          upload={upload}
          error={uploadError}
          disabled={job.busy}
          onChoose={choose}
          onClear={() => setTape(null)}
        />

        {tape && (
          <>
            <Field label={t("restore.modeLabel")} hint={t(`restore.modeHint.${mode}`)}>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                className="w-full"
                value={mode}
                disabled={job.busy}
                onValueChange={(v) => v && changeMode(v as RestoreMode)}
              >
                {RESTORE_MODES.map((m) => (
                  <ToggleGroupItem key={m} value={m} className={`flex-1 ${CHOICE_ITEM}`}>
                    {t(`restore.modes.${m}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <TrimEditor tape={tape} range={range} onChange={setRange} max={max} videoRef={videoRef} disabled={job.busy} />

            <SectionSummary
              seconds={seconds}
              max={max}
              tooLong={tooLong}
              estimate={estimate}
              mode={mode}
              warnMinutes={limits.warnMinutes}
            />

            <ColorPicker tape={tape} value={color} onChange={setColor} videoRef={videoRef} start={range[0]} disabled={job.busy} />
          </>
        )}

        <FormError error={job.error} />

        <Button type="submit" size="lg" className={SUBMIT_BUTTON} disabled={!canSubmit}>
          <RestoreIcon />
          {job.busy ? t("restore.submitting") : t("restore.submit")}
        </Button>
      </form>

      <JobPanel
        jobId={job.jobId}
        view={job.view}
        onCancel={job.cancel}
        onRetry={job.retry}
        cancelling={job.cancelling}
        emptyTitle={t("restore.emptyTitle")}
        emptyHint={t("restore.emptyHint")}
        runningHint={t("restore.runningHint", { estimate: formatEstimate(estimate, t) })}
      />
    </div>
  );
}

/** The old video: choose, upload with progress, then its facts. */
function TapePicker({
  tape,
  upload,
  error,
  disabled,
  onChoose,
  onClear,
}: {
  tape: TapeMeta | null;
  upload: { name: string; share: number } | null;
  error: string | null;
  disabled?: boolean;
  onChoose: (file: File) => void;
  onClear: () => void;
}) {
  const { t, number } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const info = tape?.info;
  return (
    <Field label={t("restore.videoLabel")} hint={t("restore.videoHint")}>
      <div
        className="flex flex-col gap-3 rounded-2xl border border-dashed border-input p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && !disabled && !upload) onChoose(file);
        }}
      >
        <div className="flex items-center gap-3">
          <FilmIcon className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{upload?.name ?? tape?.name ?? t("restore.videoEmpty")}</p>
            {tape && info && (
              <p className="text-xs text-muted-foreground">
                {t("restore.videoInfo", {
                  width: info.width,
                  height: info.height,
                  seconds: number(info.seconds, 1),
                  scan: t(tape.measurements.interlaced ? "restore.interlaced" : "restore.progressive"),
                })}
                {!info.hasAudio && ` · ${t("restore.noAudio")}`}
              </p>
            )}
          </div>
          {tape && !upload && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full sm:size-8"
              aria-label={t("restore.videoRemove")}
              disabled={disabled}
              onClick={onClear}
            >
              <XIcon aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-full sm:h-8"
            disabled={disabled || upload !== null}
            onClick={() => input.current?.click()}
          >
            {tape ? t("restore.videoReplace") : t("restore.videoChoose")}
          </Button>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChoose(file);
              e.target.value = "";
            }}
          />
        </div>
        {upload && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(upload.share * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {upload.share < 1 ? t("restore.uploading", { percent: Math.round(upload.share * 100) }) : t("restore.analyzing")}
            </p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
      </div>
    </Field>
  );
}

/**
 * The section to restore: the light copy plays above a filmstrip with two handles. Dragging a
 * handle shows that frame; "Play section" plays only the selection; the buttons put a handle at the
 * current frame (an alternative to dragging, for touch and keyboard).
 */
function TrimEditor({
  tape,
  range,
  onChange,
  max,
  videoRef,
  disabled,
}: {
  tape: TapeMeta;
  range: [number, number];
  onChange: (next: [number, number]) => void;
  max: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const duration = tape.info.seconds;
  const bar = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [playingSection, setPlayingSection] = useState(false);
  const [start, end] = range;

  const seek = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = seconds;
    setNow(seconds);
  };

  const timeAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration;
  };

  /** Moves one handle; the other follows when the section would pass the mode's limit. */
  const move = (which: 0 | 1, seconds: number) => {
    let [s, e] = range;
    if (which === 0) {
      s = Math.max(0, Math.min(seconds, e - MIN_SECTION));
      if (e - s > max) e = s + max;
    } else {
      e = Math.min(duration, Math.max(seconds, s + MIN_SECTION));
      if (e - s > max) s = e - max;
    }
    onChange([Math.max(0, s), Math.min(duration, e)]);
    seek(which === 0 ? s : e);
  };

  const drag = (which: 0 | 1) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => move(which, timeAt(e.clientX));
    const stop = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  };

  function playSection() {
    const video = videoRef.current;
    if (!video) return;
    if (playingSection) {
      video.pause();
      setPlayingSection(false);
      return;
    }
    video.currentTime = start;
    void video.play();
    setPlayingSection(true);
  }

  const pct = (s: number) => `${(s / duration) * 100}%`;

  return (
    <Field label={t("restore.trimLabel")} hint={t("restore.trimHint")}>
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-lg border bg-black">
          {tape.media === "ready" ? (
            <video
              ref={videoRef}
              src={`/api/restore/uploads/${tape.id}/proxy`}
              controls
              playsInline
              preload="auto"
              className="max-h-72 w-full object-contain"
              onTimeUpdate={(e) => {
                const time = e.currentTarget.currentTime;
                setNow(time);
                if (playingSection && time >= end) {
                  e.currentTarget.pause();
                  setPlayingSection(false);
                }
              }}
            />
          ) : (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              {tape.media === "pending" ? (
                <>
                  <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> {t("restore.preparing")}
                </>
              ) : (
                t("restore.previewFailed")
              )}
            </div>
          )}
        </div>

        <div
          ref={bar}
          className="relative h-14 touch-none select-none overflow-hidden rounded-lg border bg-secondary"
          onPointerDown={(e) => !disabled && seek(timeAt(e.clientX))}
        >
          {tape.media === "ready" && (
            // eslint-disable-next-line @next/next/no-img-element -- server-made filmstrip
            <img
              src={`/api/restore/uploads/${tape.id}/strip`}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-fill opacity-80"
            />
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-background/70" style={{ width: pct(start) }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-background/70" style={{ left: pct(end) }} />
          <div
            className="pointer-events-none absolute inset-y-0 border-y-2 border-primary"
            style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
          />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: pct(now) }} />
          {([0, 1] as const).map((which) => (
            <button
              key={which}
              type="button"
              role="slider"
              aria-label={t(which === 0 ? "restore.handleStart" : "restore.handleEnd")}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(range[which])}
              aria-valuetext={clock(range[which])}
              disabled={disabled}
              onPointerDown={drag(which)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 5 : 0.5;
                if (e.key === "ArrowLeft") move(which, range[which] - step);
                if (e.key === "ArrowRight") move(which, range[which] + step);
              }}
              className="absolute inset-y-0 z-10 w-5 -translate-x-1/2 cursor-ew-resize rounded-md bg-primary shadow focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: pct(range[which]) }}
            >
              <span className="mx-auto block h-6 w-0.5 rounded bg-primary-foreground/70" />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {clock(start)} – {clock(end)}
          </span>
          <span className="flex-1" />
          <Button type="button" variant="outline" size="sm" className="h-10 rounded-full sm:h-8" disabled={disabled} onClick={() => move(0, now)}>
            {t("restore.setStart")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-10 rounded-full sm:h-8" disabled={disabled} onClick={() => move(1, now)}>
            {t("restore.setEnd")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 rounded-full sm:h-8"
            disabled={tape.media !== "ready"}
            onClick={playSection}
          >
            {playingSection ? <SquareIcon aria-hidden /> : <PlayIcon aria-hidden />}
            {t(playingSection ? "restore.stopSection" : "restore.playSection")}
          </Button>
        </div>
      </div>
    </Field>
  );
}

/** Length of the section, the limit of the mode and the time estimate, colored past each step. */
function SectionSummary({
  seconds,
  max,
  tooLong,
  estimate,
  mode,
  warnMinutes,
}: {
  seconds: number;
  max: number;
  tooLong: boolean;
  estimate: number;
  mode: RestoreMode;
  warnMinutes: number[];
}) {
  const { t, number } = useI18n();
  const level = Math.min(estimateLevel(estimate, warnMinutes), LEVEL_STYLES.length - 1);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("restore.sectionLength", { seconds: number(seconds, 1) })}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", LEVEL_STYLES[level])}>
          {t(`restore.estimate.${mode}`, { estimate: formatEstimate(estimate, t) })}
        </span>
      </div>
      <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
        {t(tooLong ? `restore.tooLong.${mode}` : `restore.limit.${mode}`, { max: formatLimit(max, t) })}
      </p>
    </div>
  );
}

/** The color correction, chosen from previews of one frame (where the video is paused, or the section start). */
function ColorPicker({
  tape,
  value,
  onChange,
  videoRef,
  start,
  disabled,
}: {
  tape: TapeMeta;
  value: ColorId;
  onChange: (next: ColorId) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  start: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<{ tape: string; images: Record<PreviewChoice, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Previews of another tape don't count.
  const images = preview?.tape === tape.id ? preview.images : null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const at = videoRef.current?.currentTime ?? start;
      setPreview({ tape: tape.id, images: (await previewTape(tape.id, at)).images });
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "unexpected");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label={t("restore.colorLabel")} hint={t("restore.colorHint")}>
      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" className="h-10 self-start rounded-full" disabled={disabled || loading} onClick={load}>
          {loading && <LoaderCircleIcon className="animate-spin" aria-hidden />}
          {t(images ? "restore.colorRefresh" : "restore.colorPreview")}
        </Button>
        {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
        <div role="radiogroup" aria-label={t("restore.colorLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {images && (
            <figure className="flex flex-col gap-1 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- server-made preview */}
              <img src={images.original} alt={t("restore.colors.original")} className="aspect-[4/3] w-full rounded-lg border object-cover" />
              <figcaption className="text-xs text-muted-foreground">{t("restore.colors.original")}</figcaption>
            </figure>
          )}
          {COLOR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value === id}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border bg-card p-1.5 text-left transition-colors hover:border-ring/70",
                value === id && "border-primary bg-primary/10",
                !images && "p-2.5",
              )}
            >
              {images && (
                // eslint-disable-next-line @next/next/no-img-element -- server-made preview
                <img src={images[id]} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
              )}
              <span className="text-xs font-medium">{t(`restore.colors.${id}`)}</span>
              {!images && <span className="text-[11px] leading-snug text-muted-foreground">{t(`restore.colorHints.${id}`)}</span>}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}
