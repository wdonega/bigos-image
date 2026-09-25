"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { ApiError, type Enhanced, enhancePrompt } from "@/lib/client/api";
import { tokensToMentions } from "@/lib/mentions";

type Phase = "idle" | "loading" | "suggest" | "applied";

/**
 * "Improve text" around a prompt field: asks for a suggestion, lets the user accept it (the field
 * then shows the version in their language and the English one goes to the generator) or go back.
 * Any edit to the field after accepting drops the English version: what is on screen is what is sent.
 */
export function usePromptEnhancer(prompt: string, setPrompt: (value: string) => void) {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [suggestion, setSuggestion] = useState<Enhanced | null>(null);
  const [original, setOriginal] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const word = t("references.mentionWord");

  async function enhance() {
    if (!prompt.trim() || phase === "loading") return;
    setPhase("loading");
    setError(null);
    try {
      const result = await enhancePrompt(prompt, locale);
      setSuggestion({ english: result.english, summary: tokensToMentions(result.summary, word) });
      setPhase("suggest");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("unexpected"));
      setPhase("idle");
    }
  }

  function apply() {
    if (!suggestion) return;
    setOriginal(prompt);
    setPrompt(suggestion.summary);
    setPhase("applied");
  }

  function discard() {
    setSuggestion(null);
    setPhase("idle");
  }

  function undo() {
    setPrompt(original);
    discard();
  }

  /** Call from the field's onChange. */
  function edit(value: string) {
    setPrompt(value);
    if (phase === "applied") discard();
  }

  return {
    phase,
    suggestion,
    error,
    enhance,
    apply,
    discard,
    undo,
    edit,
    /** English shown to users, with image mentions as readable labels. */
    englishForDisplay: suggestion ? tokensToMentions(suggestion.english, "Image") : "",
    /** Value for `english_prompt` in the job request. */
    englishPrompt: phase === "applied" && suggestion ? suggestion.english : null,
  };
}

export type PromptEnhancer = ReturnType<typeof usePromptEnhancer>;
