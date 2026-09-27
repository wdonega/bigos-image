"use client";

import { type FormEvent, useState } from "react";
import { Field, PROMPT_CARD, PROMPT_TEXTAREA, SUBMIT_BUTTON } from "@/components/field";
import { FormError } from "@/components/form-error";
import { MusicIcon } from "@/components/icons";
import { JobPanel } from "@/components/job-panel";
import { GenrePicker, LyricsField, MusicDurationPicker } from "@/components/music-options";
import { PromptEnhancerBar } from "@/components/prompt-enhancer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJobRunner } from "@/hooks/use-job-runner";
import { usePromptEnhancer } from "@/hooks/use-prompt-enhancer";
import { useI18n } from "@/i18n/provider";
import type { MusicDuration, MusicGenreId } from "@/lib/music";
import type { ScreenLimits } from "@/lib/screen-limits";

/** Music (spec §14, decision 30): the Image screen's shape, with lyrics, genre and duration. */
export function MusicScreen({ limits }: { limits: ScreenLimits }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [genre, setGenre] = useState<MusicGenreId | null>(null);
  const [duration, setDuration] = useState<MusicDuration>(60);
  const job = useJobRunner();
  const enhancer = usePromptEnhancer(prompt, setPrompt, "music");

  const canSubmit = prompt.trim().length > 0 && !job.busy;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void job.submit({ screen: "music", prompt, lyrics, instrumental, genre, duration });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label={t("music.promptLabel")} htmlFor="prompt">
          <div className={PROMPT_CARD}>
            <Textarea
              className={PROMPT_TEXTAREA}
              id="prompt"
              rows={4}
              placeholder={t("music.promptPlaceholder")}
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

        <LyricsField
          instrumental={instrumental}
          onInstrumentalChange={setInstrumental}
          lyrics={lyrics}
          onLyricsChange={setLyrics}
          idea={prompt}
          genre={genre}
          canWrite={limits.canEnhance}
          disabled={job.busy}
        />
        <GenrePicker value={genre} onChange={setGenre} disabled={job.busy} />
        <MusicDurationPicker value={duration} onChange={setDuration} disabled={job.busy} />
        <FormError error={job.error} />

        <Button type="submit" size="lg" className={SUBMIT_BUTTON} disabled={!canSubmit}>
          <MusicIcon />
          {job.busy ? t("music.submitting") : t("music.submit")}
        </Button>
      </form>

      <JobPanel
        jobId={job.jobId}
        view={job.view}
        onCancel={job.cancel}
        onRetry={job.retry}
        cancelling={job.cancelling}
        emptyTitle={t("music.emptyTitle")}
        emptyHint={t("music.emptyHint")}
        runningHint={t("music.runningHint")}
      />
    </div>
  );
}
