"use client";

import { LoaderCircleIcon, Undo2Icon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { CHOICE_ITEM, Field, PROMPT_CARD, PROMPT_TEXTAREA } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/provider";
import { ApiError, writeLyrics } from "@/lib/client/api";
import { MUSIC_DURATIONS, MUSIC_GENRES, type MusicDuration, type MusicGenreId } from "@/lib/music";
import { cn } from "@/lib/utils";

/** Optional genre: one chip at a time; tapping the chosen one clears it. */
export function GenrePicker({
  value,
  onChange,
  disabled,
}: {
  value: MusicGenreId | null;
  onChange: (next: MusicGenreId | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Field label={t("music.genre")} hint={t("music.genreHint")}>
      <div className="flex flex-wrap gap-1.5">
        {MUSIC_GENRES.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            aria-pressed={value === g.id}
            onClick={() => onChange(value === g.id ? null : g.id)}
            className={cn(
              "h-9 rounded-full border px-3 text-sm transition-colors disabled:opacity-50 sm:h-8 sm:text-xs",
              value === g.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {t(`musicGenres.${g.id}`)}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function MusicDurationPicker({
  value,
  onChange,
  disabled,
}: {
  value: MusicDuration;
  onChange: (next: MusicDuration) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const label = (s: number) => (s < 60 ? t("music.secondsLabel", { seconds: s }) : t("music.minutesLabel", { minutes: s / 60 }));
  return (
    <Field label={t("music.duration")} hint={t("music.durationHint")}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="w-full"
        value={String(value)}
        disabled={disabled}
        onValueChange={(v) => v && onChange(Number(v) as MusicDuration)}
      >
        {MUSIC_DURATIONS.map((d) => (
          <ToggleGroupItem key={d} value={String(d)} className={`flex-1 ${CHOICE_ITEM}`}>
            {label(d)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

/**
 * Lyrics: "With lyrics" (typed by the user, or written by "Create lyrics for me" for review, with
 * one step of undo) or "Instrumental". The lyrics are sung as written (spec §14, decision 30).
 */
export function LyricsField({
  instrumental,
  onInstrumentalChange,
  lyrics,
  onLyricsChange,
  idea,
  genre,
  canWrite,
  disabled,
}: {
  instrumental: boolean;
  onInstrumentalChange: (next: boolean) => void;
  lyrics: string;
  onLyricsChange: (next: string) => void;
  /** The song description, used to write lyrics about it. */
  idea: string;
  genre: MusicGenreId | null;
  /** False when no LLM is configured. */
  canWrite: boolean;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [writing, setWriting] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function write() {
    setWriting(true);
    setError(null);
    try {
      const text = await writeLyrics(idea, locale, genre);
      setPrevious(lyrics);
      onLyricsChange(text);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("unexpected"));
    } finally {
      setWriting(false);
    }
  }

  return (
    <Field label={t("music.lyricsLabel")} htmlFor={instrumental ? undefined : "lyrics"}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="w-full"
        value={instrumental ? "instrumental" : "lyrics"}
        disabled={disabled}
        onValueChange={(v) => v && onInstrumentalChange(v === "instrumental")}
      >
        <ToggleGroupItem value="lyrics" className={`flex-1 ${CHOICE_ITEM}`}>
          {t("music.withLyrics")}
        </ToggleGroupItem>
        <ToggleGroupItem value="instrumental" className={`flex-1 ${CHOICE_ITEM}`}>
          {t("music.instrumental")}
        </ToggleGroupItem>
      </ToggleGroup>
      {instrumental ? (
        <p className="text-xs text-muted-foreground">{t("music.instrumentalHint")}</p>
      ) : (
        <div className={PROMPT_CARD}>
          <Textarea
            id="lyrics"
            className={cn(PROMPT_TEXTAREA, "min-h-32")}
            rows={6}
            placeholder={t("music.lyricsPlaceholder")}
            value={lyrics}
            disabled={disabled}
            onChange={(e) => {
              onLyricsChange(e.target.value);
              setPrevious(null);
            }}
          />
          {canWrite && (
            <div className="flex min-h-8 items-center justify-between gap-3">
              {previous !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    onLyricsChange(previous);
                    setPrevious(null);
                  }}
                  disabled={disabled || writing}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <Undo2Icon className="size-3.5" aria-hidden />
                  {t("enhance.undo")}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t("music.lyricsTip")}</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void write()}
                disabled={disabled || writing || idea.trim().length === 0}
              >
                {writing ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <WandSparklesIcon aria-hidden />}
                {writing ? t("music.writingLyrics") : t("music.writeLyrics")}
              </Button>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {t(`errors.${error.code}`)}
            </p>
          )}
        </div>
      )}
    </Field>
  );
}
