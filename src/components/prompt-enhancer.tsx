"use client";

import { CheckIcon, LoaderCircleIcon, Undo2Icon, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { PromptEnhancer } from "@/hooks/use-prompt-enhancer";

/** Under the prompt: the "Improve text" button (always available) and, after it runs, "Undo". */
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
  if (!canEnhance) return null;
  const { loading, error, canUndo } = enhancer;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        {canUndo ? (
          <span className="flex items-center gap-3 text-xs" role="status">
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <CheckIcon className="size-3.5" aria-hidden />
              {t("enhance.applied")}
            </span>
            <button
              type="button"
              onClick={enhancer.undo}
              disabled={disabled || loading}
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <Undo2Icon className="size-3.5" aria-hidden />
              {t("enhance.undo")}
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("enhance.anyLanguage")}</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void enhancer.enhance()}
          disabled={disabled || empty || loading}
        >
          {loading ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <WandSparklesIcon aria-hidden />}
          {loading ? t("enhance.loading") : t("enhance.button")}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error.code}`)}
        </p>
      )}
    </div>
  );
}
