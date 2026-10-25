"use client";

import {
  EraserIcon,
  FilmIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  ScanFaceIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { Field, PROMPT_CARD, PROMPT_TEXTAREA, SUBMIT_BUTTON } from "@/components/field";
import { FormError } from "@/components/form-error";
import { EffectsIcon } from "@/components/icons";
import { JobPanel } from "@/components/job-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useJobRunner } from "@/hooks/use-job-runner";
import { ACCEPTED_VIDEO_TYPES, useSingleUpload } from "@/hooks/use-single-upload";
import { ACCEPTED_TYPES } from "@/hooks/use-uploads";
import { useI18n } from "@/i18n/provider";
import { uploadImage, uploadVideo } from "@/lib/client/api";
import { captureFirstFrame } from "@/lib/client/video-frame";
import { EFFECTS, EFFECT_IDS, type EffectId } from "@/lib/effects";
import type { ScreenLimits } from "@/lib/screen-limits";
import { cn } from "@/lib/utils";

const EFFECT_ICONS: Record<EffectId, typeof EraserIcon> = {
  remove_people: EraserIcon,
  face_swap: ScanFaceIcon,
  animate: PersonStandingIcon,
  character_swap: UsersRoundIcon,
};

const sendVideo = async (file: File) => uploadVideo(file, await captureFirstFrame(file));

/** Video effects (spec §14, decision 31): pick an effect, send a video (and a photo), apply. */
export function EffectsScreen({ limits }: { limits: ScreenLimits }) {
  const { t, number } = useI18n();
  const [effect, setEffect] = useState<EffectId>("remove_people");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const job = useJobRunner();
  const video = useSingleUpload(sendVideo, {
    maxBytes: limits.maxVideoUploadBytes,
    tooLarge: "video_too_large",
    failed: "video_upload_failed",
  });
  const photo = useSingleUpload(uploadImage, {
    maxBytes: limits.maxUploadBytes,
    tooLarge: "image_too_large",
    failed: "upload_failed",
  });
  const spec = EFFECTS[effect];

  const photoReady = !spec.photo || photo.ready;
  const canSubmit = video.ready && photoReady && (!spec.consent || consent) && !job.busy;
  const uploading = video.item?.status === "uploading" || (spec.photo !== null && photo.item?.status === "uploading");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !video.id) return;
    void job.submit({
      screen: "effects",
      effect,
      video: video.id,
      images: spec.photo && photo.id ? [photo.id] : [],
      prompt: text,
      consent,
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <EffectPicker value={effect} onChange={setEffect} disabled={job.busy} />

        <Field label={t("effects.videoLabel")} hint={t("effects.videoHint", { seconds: limits.effectMaxSeconds })}>
          <FilePicker
            upload={video}
            accept={ACCEPTED_VIDEO_TYPES}
            disabled={job.busy}
            icon={<FilmIcon className="size-5 shrink-0 text-primary" aria-hidden />}
            emptyText={t("effects.videoEmpty")}
            chooseText={video.item ? t("effects.videoReplace") : t("effects.videoChoose")}
            removeText={t("effects.videoRemove")}
            uploadingText={t("effects.videoUploading")}
            preview={(url) => (
              <video src={url} controls muted playsInline preload="metadata" className="max-h-64 w-full bg-black object-contain" />
            )}
            info={
              video.item?.upload
                ? t("effects.videoInfo", {
                    seconds: number(video.item.upload.seconds, 1),
                    width: video.item.upload.width,
                    height: video.item.upload.height,
                  })
                : null
            }
            warnings={video.item?.upload?.warnings}
          />
        </Field>

        {spec.photo && (
          <Field label={t(`effects.photo.${spec.photo}`)} hint={t(`effects.photoHint.${effect}`)}>
            <FilePicker
              upload={photo}
              accept={ACCEPTED_TYPES}
              disabled={job.busy}
              icon={<ImagePlusIcon className="size-5 shrink-0 text-primary" aria-hidden />}
              emptyText={t("effects.photoEmpty")}
              chooseText={photo.item ? t("effects.photoReplace") : t("effects.photoChoose")}
              removeText={t("effects.photoRemove")}
              uploadingText={t("references.uploading")}
              preview={(url) => (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={url} alt={t(`effects.photo.${spec.photo}`)} className="max-h-40 w-full object-contain" />
              )}
            />
          </Field>
        )}

        <Field label={t(`effects.text.${effect}.label`)} htmlFor="effect-text">
          <div className={PROMPT_CARD}>
            <Textarea
              className={PROMPT_TEXTAREA}
              id="effect-text"
              rows={2}
              maxLength={500}
              placeholder={t(`effects.text.${effect}.placeholder`)}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        </Field>

        {spec.consent && (
          <label htmlFor="consent" className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5">
            <div className="flex flex-1 flex-col gap-0.5">
              <span id="consent-label" className="text-sm font-medium">
                {t("effects.consent")}
              </span>
              <p id="consent-hint" className="text-xs text-muted-foreground">
                {t("effects.consentHint")}
              </p>
            </div>
            <Checkbox
              id="consent"
              aria-labelledby="consent-label"
              aria-describedby="consent-hint"
              checked={consent}
              disabled={job.busy}
              onCheckedChange={(value) => setConsent(value === true)}
              className="size-5"
            />
          </label>
        )}

        <FormError error={job.error} />

        <Button type="submit" size="lg" className={SUBMIT_BUTTON} disabled={!canSubmit}>
          <EffectsIcon />
          {job.busy ? t("effects.submitting") : uploading ? t("effects.uploading") : t("effects.submit")}
        </Button>
      </form>

      <JobPanel
        jobId={job.jobId}
        view={job.view}
        onCancel={job.cancel}
        onRetry={job.retry}
        cancelling={job.cancelling}
        emptyTitle={t("effects.emptyTitle")}
        emptyHint={t("effects.emptyHint")}
        runningHint={t("effects.runningHint", { minutes: spec.minutes, seconds: limits.effectMaxSeconds })}
      />
    </div>
  );
}

/** The four effects as cards: name, what it does and how long it takes. */
function EffectPicker({
  value,
  onChange,
  disabled,
}: {
  value: EffectId;
  onChange: (next: EffectId) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Field label={t("effects.effectLabel")}>
      <div role="radiogroup" aria-label={t("effects.effectLabel")} className="grid grid-cols-2 gap-2">
        {EFFECT_IDS.map((id) => {
          const Icon = EFFECT_ICONS[id];
          const selected = id === value;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border bg-card p-3 text-left transition-colors hover:border-ring/70 disabled:opacity-60",
                selected && "border-primary bg-primary/10",
              )}
            >
              <Icon className={cn("size-5 text-muted-foreground", selected && "text-primary")} aria-hidden />
              <span className="text-sm font-medium">{t(`effects.names.${id}`)}</span>
              <span className="text-xs leading-snug text-muted-foreground">{t(`effects.descriptions.${id}`)}</span>
              <span className="mt-auto pt-1 text-[11px] text-muted-foreground">
                {t("effects.time", { minutes: EFFECTS[id].minutes })}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** One file (the video or the photo): choose, drop, preview, replace, remove. */
function FilePicker<T extends { id: string }>({
  upload,
  accept,
  disabled,
  icon,
  emptyText,
  chooseText,
  removeText,
  uploadingText,
  preview,
  info,
  warnings,
}: {
  upload: ReturnType<typeof useSingleUpload<T>>;
  accept: string;
  disabled?: boolean;
  icon: ReactNode;
  emptyText: string;
  chooseText: string;
  removeText: string;
  uploadingText: string;
  preview: (url: string) => ReactNode;
  info?: string | null;
  warnings?: { code: string; params?: Record<string, string | number> }[];
}) {
  const { t, detail } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const item = upload.item;
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-input p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !disabled) upload.choose(file);
      }}
    >
      {item && (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {preview(item.previewUrl)}
          {item.status === "uploading" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm">
              <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> {uploadingText}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item ? item.name : emptyText}</p>
          {info && <p className="text-xs text-muted-foreground">{info}</p>}
        </div>
        {item && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full sm:size-8"
            aria-label={removeText}
            disabled={disabled}
            onClick={upload.clear}
          >
            <XIcon aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-full sm:h-8"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {chooseText}
        </Button>
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.choose(file);
            e.target.value = "";
          }}
        />
      </div>
      {item?.status === "error" && <p className="text-sm text-destructive">{t(`errors.${item.error}`)}</p>}
      {warnings?.map((w) => (
        <p key={w.code} className="text-xs text-muted-foreground">
          {detail("warnings", w)}
        </p>
      ))}
    </div>
  );
}
