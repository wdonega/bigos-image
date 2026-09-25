"use client";

import { CheckIcon, ChevronDownIcon, ChevronRightIcon, LoaderCircleIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { PromptEnhancer } from "@/hooks/use-prompt-enhancer";

/** Sits under the prompt field: "Improve text" button, the suggestion to review, and the applied state. */
export function PromptEnhancerBar({
  enhancer,
  canEnhance,
  disabled,
  empty,
}: {
  enhancer: PromptEnhancer;
  canEnhance: boolean;
  disabled?: boolean;
  empty: boolean;
}) {
  const { t } = useI18n();
  const [showEnglish, setShowEnglish] = useState(false);
  const { phase, suggestion, error } = enhancer;
  if (!canEnhance) return null;

  const english = showEnglish && (
    <p className="rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-relaxed text-muted-foreground" lang="en">
      {enhancer.englishForDisplay}
    </p>
  );
  const englishToggle = (
    <button
      type="button"
      onClick={() => setShowEnglish((v) => !v)}
      aria-expanded={showEnglish}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      {showEnglish ? (
        <ChevronDownIcon className="size-3.5" aria-hidden />
      ) : (
        <ChevronRightIcon className="size-3.5" aria-hidden />
      )}
      {showEnglish ? t("enhance.hideEnglish") : t("enhance.showEnglish")}
    </button>
  );

  if (phase === "applied") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            <CheckIcon className="size-3.5" aria-hidden />
            {t("enhance.applied")}
          </span>
          {englishToggle}
          <button
            type="button"
            onClick={enhancer.undo}
            disabled={disabled}
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("enhance.undo")}
          </button>
        </div>
        {english}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{t("enhance.anyLanguage")}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setShowEnglish(false);
            void enhancer.enhance();
          }}
          disabled={disabled || empty || phase === "loading"}
        >
          {phase === "loading" ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : (
            <WandSparklesIcon aria-hidden />
          )}
          {phase === "loading" ? t("enhance.loading") : t("enhance.button")}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error.code}`)}
        </p>
      )}
      {phase === "suggest" && suggestion && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3" role="status">
          <span className="text-xs font-medium text-primary">{t("enhance.suggestion")}</span>
          <p className="text-sm leading-relaxed">{suggestion.summary}</p>
          <div>{englishToggle}</div>
          {english}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={enhancer.discard}>
              {t("enhance.discard")}
            </Button>
            <Button type="button" size="sm" onClick={enhancer.apply} disabled={disabled}>
              {t("enhance.use")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
