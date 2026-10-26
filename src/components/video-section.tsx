"use client";

import { FilmIcon, LoaderCircleIcon, PlayIcon, SquareIcon, XIcon } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { ApiError, type TapeMeta, getTape, uploadTape } from "@/lib/client/api";
import { estimateLevel } from "@/lib/restore";
import { cn } from "@/lib/utils";

// Shared by Restore and Effects (spec §14, decisions 31–32): an uploaded video (streamed, with a
// light copy the browser can play) and the section of it to work on.

type Translate = ReturnType<typeof useI18n>["t"];

/** Accepted on the file picker (ffmpeg reads them; the server checks again by extension). */
const ACCEPTED = "video/*,.mpg,.mpeg,.vob,.avi,.dv,.mov,.mp4,.m4v,.mkv,.wmv,.3gp,.ts,.m2ts,.flv";
/** How often the screen asks whether the trim editor's proxy is ready. */
const POLL_MS = 1500;
/** Shortest section the backend accepts. */
export const MIN_SECTION = 1;

/** Estimate warning styles by level (past each step of RESTORE_WARN_MINUTES), readable in both themes. */
const LEVEL_STYLES = [
  "bg-secondary text-muted-foreground",
  "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  "bg-destructive/15 text-destructive",
];

/** "1 h 50 min", "25 min" or "less than a minute". */
export function formatEstimate(seconds: number, t: Translate): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("source.estimateUnderMinute");
  if (minutes < 60) return t("source.estimateMinutes", { minutes });
  return t("source.estimateHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** "1 min", "30 min" or "45 s". */
export function formatLimit(seconds: number, t: Translate): string {
  return seconds >= 60 && seconds % 60 === 0 ? t("source.limitMinutes", { minutes: seconds / 60 }) : t("source.limitSeconds", { seconds });
}

/** Clock time for the trim editor: 1:05.3 */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * The uploaded video: upload with progress, then poll until the proxy is ready. `onReady` gets the
 * facts right after the upload (to set the first section).
 */
export function useVideoSource(maxBytes: number, onReady: (meta: TapeMeta) => void) {
  const [tape, setTape] = useState<TapeMeta | null>(null);
  const [upload, setUpload] = useState<{ name: string; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tape || tape.media !== "pending") return;
    const timer = setTimeout(() => {
      getTape(tape.id)
        .then(setTape)
        .catch(() => {});
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [tape]);

  async function choose(file: File) {
    setError(null);
    setTape(null);
    if (file.size > maxBytes) {
      setError("video_too_large");
      return;
    }
    setUpload({ name: file.name, share: 0 });
    try {
      const meta = await uploadTape(file, (share) => setUpload({ name: file.name, share }));
      setTape(meta);
      onReady(meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "video_upload_failed");
    } finally {
      setUpload(null);
    }
  }

  return { tape, upload, error, choose, clear: () => setTape(null) };
}

/** The video: choose, upload with progress, then its facts. */
export function VideoSourcePicker({
  source,
  label,
  hint,
  disabled,
}: {
  source: ReturnType<typeof useVideoSource>;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  const { t, number } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const { tape, upload, error } = source;
  const info = tape?.info;
  return (
    <Field label={label} hint={hint}>
      <div
        className="flex flex-col gap-3 rounded-2xl border border-dashed border-input p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && !disabled && !upload) void source.choose(file);
        }}
      >
        <div className="flex items-center gap-3">
          <FilmIcon className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{upload?.name ?? tape?.name ?? t("source.videoEmpty")}</p>
            {tape && info && (
              <p className="text-xs text-muted-foreground">
                {t("source.videoInfo", {
                  width: info.width,
                  height: info.height,
                  seconds: number(info.seconds, 1),
                  scan: t(tape.measurements.interlaced ? "source.interlaced" : "source.progressive"),
                })}
                {!info.hasAudio && ` · ${t("source.noAudio")}`}
              </p>
            )}
          </div>
          {tape && !upload && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full sm:size-8"
              aria-label={t("source.videoRemove")}
              disabled={disabled}
              onClick={source.clear}
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
            {tape ? t("source.videoReplace") : t("source.videoChoose")}
          </Button>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void source.choose(file);
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
              {upload.share < 1 ? t("source.uploading", { percent: Math.round(upload.share * 100) }) : t("source.analyzing")}
            </p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
      </div>
    </Field>
  );
}

/**
 * The section: the light copy plays above a filmstrip with two handles. Dragging a handle shows that
 * frame; "Play section" plays only the selection; the buttons put a handle at the current frame (an
 * alternative to dragging, for touch and keyboard). The section stays between MIN_SECTION and `max`.
 */
export function TrimEditor({
  tape,
  range,
  onChange,
  max,
  videoRef,
  label,
  hint,
  disabled,
}: {
  tape: TapeMeta;
  range: [number, number];
  onChange: (next: [number, number]) => void;
  max: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  hint: string;
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

  /** Moves one handle; the other follows when the section would pass the limit. */
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
    <Field label={label} hint={hint}>
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
                  <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> {t("source.preparing")}
                </>
              ) : (
                t("source.previewFailed")
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
              aria-label={t(which === 0 ? "source.handleStart" : "source.handleEnd")}
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
            {t("source.setStart")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-10 rounded-full sm:h-8" disabled={disabled} onClick={() => move(1, now)}>
            {t("source.setEnd")}
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
            {t(playingSection ? "source.stopSection" : "source.playSection")}
          </Button>
        </div>
      </div>
    </Field>
  );
}

/** Length of the section, a line about the limit and the time estimate, colored past each warning step. */
export function SectionSummary({
  seconds,
  estimateText,
  estimateSeconds,
  warnMinutes,
  note,
  tooLong,
}: {
  seconds: number;
  /** The badge text (e.g. "about 46 min of GPU"). */
  estimateText: string;
  estimateSeconds: number;
  warnMinutes: number[];
  note: string;
  tooLong: boolean;
}) {
  const { t, number } = useI18n();
  const level = Math.min(estimateLevel(estimateSeconds, warnMinutes), LEVEL_STYLES.length - 1);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("source.sectionLength", { seconds: number(seconds, 1) })}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", LEVEL_STYLES[level])}>{estimateText}</span>
      </div>
      <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>{note}</p>
    </div>
  );
}
