"use client";

import { type FormEvent, useRef, useState } from "react";
import { Field, PROMPT_CARD, PROMPT_TEXTAREA, SUBMIT_BUTTON } from "@/components/field";
import { FormError } from "@/components/form-error";
import { VideoIcon } from "@/components/icons";
import { JobPanel } from "@/components/job-panel";
import { PromptEnhancerBar } from "@/components/prompt-enhancer";
import { type Quality, QualityPicker } from "@/components/quality-picker";
import { ReferencePicker } from "@/components/reference-picker";
import { StyleField } from "@/components/style-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DurationPicker, VideoRatioPicker } from "@/components/video-options";
import { useJobRunner } from "@/hooks/use-job-runner";
import { usePromptEnhancer } from "@/hooks/use-prompt-enhancer";
import { useUploads } from "@/hooks/use-uploads";
import { useI18n } from "@/i18n/provider";
import { mentionLabel, renumberMentions } from "@/lib/mentions";
import type { ScreenLimits } from "@/lib/screen-limits";
import type { StyleId } from "@/lib/styles";
import type { VideoDuration, VideoRatio } from "@/lib/video";

/** Video (spec §14, decision 28): the Generate screen's shape, with duration instead of size. */
export function VideoScreen({ limits }: { limits: ScreenLimits }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<VideoRatio>("16:9");
  const [duration, setDuration] = useState<VideoDuration>(5);
  const [quality, setQuality] = useState<Quality>("normal");
  const [style, setStyle] = useState<StyleId | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const job = useJobRunner();
  const enhancer = usePromptEnhancer(prompt, setPrompt, "video");
  const uploads = useUploads(limits.maxVideoRefs, (order) => {
    // Undo would bring back the old image numbers.
    enhancer.forget();
    setPrompt((p) => renumberMentions(p, order, t("references.mentionWord"), t("references.removedMention")));
  });

  const canSubmit = prompt.trim().length > 0 && uploads.ready && !job.busy;

  function insertMention(n: number) {
    const el = promptRef.current;
    const text = `${mentionLabel(n, t("references.mentionWord"))} `;
    const start = el?.selectionStart ?? prompt.length;
    const end = el?.selectionEnd ?? prompt.length;
    enhancer.edit(prompt.slice(0, start) + text + prompt.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void job.submit({ screen: "video", prompt, images: uploads.ids, ratio, duration, quality, style });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label={t("video.promptLabel")} htmlFor="prompt">
          <div className={PROMPT_CARD}>
            <Textarea
              className={PROMPT_TEXTAREA}
              id="prompt"
              ref={promptRef}
              rows={5}
              placeholder={t("video.promptPlaceholder")}
              value={prompt}
              onChange={(e) => enhancer.edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
            <PromptEnhancerBar
              enhancer={enhancer}
              canEnhance={limits.canEnhance}
              disabled={job.busy}
              empty={prompt.trim().length === 0}
            />
          </div>
        </Field>

        <ReferencePicker
          uploads={uploads}
          max={limits.maxVideoRefs}
          disabled={job.busy}
          onMention={insertMention}
          help={t("video.referencesHelp")}
        />
        <StyleField value={style} onChange={setStyle} disabled={job.busy} noneHint={t("video.styleNoneHint")} />
        <VideoRatioPicker value={ratio} onChange={setRatio} disabled={job.busy} />
        <DurationPicker value={duration} onChange={setDuration} disabled={job.busy} />
        <QualityPicker
          value={quality}
          onChange={setQuality}
          disabled={job.busy}
          hints={{ normal: t("video.qualityNormalHint"), high: t("video.qualityHighHint") }}
        />
        <FormError error={job.error} />

        <Button type="submit" size="lg" className={SUBMIT_BUTTON} disabled={!canSubmit}>
          <VideoIcon />
          {job.busy ? t("video.submitting") : uploads.ready ? t("video.submit") : t("generate.uploading")}
        </Button>
      </form>

      <JobPanel
        jobId={job.jobId}
        view={job.view}
        onCancel={job.cancel}
        onRetry={job.retry}
        cancelling={job.cancelling}
        emptyTitle={t("video.emptyTitle")}
        emptyHint={t("video.emptyHint")}
        runningHint={t("video.runningHint")}
      />
    </div>
  );
}
