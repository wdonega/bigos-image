"use client";

import { LoaderCircleIcon } from "lucide-react";
import { type FormEvent, type RefObject, useRef, useState } from "react";
import { CHOICE_ITEM, Field, SUBMIT_BUTTON } from "@/components/field";
import { FormError } from "@/components/form-error";
import { RestoreIcon } from "@/components/icons";
import { JobPanel } from "@/components/job-panel";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MIN_SECTION,
  SectionSummary,
  TrimEditor,
  VideoSourcePicker,
  formatEstimate,
  formatLimit,
  useVideoSource,
} from "@/components/video-section";
import { useJobRunner } from "@/hooks/use-job-runner";
import { useI18n } from "@/i18n/provider";
import { ApiError, type PreviewChoice, type TapeMeta, previewTape } from "@/lib/client/api";
import { COLOR_IDS, type ColorId, RESTORE_MODES, type RestoreMode, estimateSeconds } from "@/lib/restore";
import type { ScreenLimits } from "@/lib/screen-limits";
import { cn } from "@/lib/utils";

/** Old video restoration (spec §14, decision 32): upload, trim, pick a color, restore. */
export function RestoreScreen({ limits, jobId }: { limits: ScreenLimits["restore"]; jobId: string | null }) {
  const { t } = useI18n();
  const job = useJobRunner("restore", jobId);
  const [mode, setMode] = useState<RestoreMode>("upscale");
  const [color, setColor] = useState<ColorId>("normalize");
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useVideoSource(limits.maxUploadBytes, (meta) =>
    setRange([0, Math.min(meta.info.seconds, limits.maxSeconds[mode])]),
  );
  const tape = source.tape;

  const max = limits.maxSeconds[mode];
  const seconds = Math.max(range[1] - range[0], 0);
  const tooLong = seconds > max + 0.01;
  const estimate = estimateSeconds(seconds, mode, limits.factors);
  const canSubmit = tape !== null && !tooLong && seconds >= MIN_SECTION && !job.busy;

  function changeMode(next: RestoreMode) {
    setMode(next);
    // Keep the start; shorten the end when the new mode allows less.
    setRange(([start, end]) => [start, Math.min(end, start + limits.maxSeconds[next])]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !tape) return;
    void job.submit({ screen: "restore", upload: tape.id, start: range[0], end: range[1], color, mode }, { label: tape.name });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <VideoSourcePicker source={source} label={t("restore.videoLabel")} hint={t("restore.videoHint")} disabled={job.busy} />

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

            <TrimEditor
              tape={tape}
              range={range}
              onChange={setRange}
              max={max}
              videoRef={videoRef}
              label={t("restore.trimLabel")}
              hint={t("restore.trimHint")}
              disabled={job.busy}
            />

            <SectionSummary
              seconds={seconds}
              estimateText={t(`restore.estimate.${mode}`, { estimate: formatEstimate(estimate, t) })}
              estimateSeconds={estimate}
              warnMinutes={limits.warnMinutes}
              note={t(tooLong ? `restore.tooLong.${mode}` : `restore.limit.${mode}`, { max: formatLimit(max, t) })}
              tooLong={tooLong}
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
