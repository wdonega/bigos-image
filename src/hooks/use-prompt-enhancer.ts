"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { ApiError, type EnhanceKind, enhancePrompt } from "@/lib/client/api";

/**
 * "Improve text": replaces the field's text with a more detailed version (same language) and
 * offers one step of undo. It can be used again on the improved text. Typing drops the undo.
 */
export function usePromptEnhancer(
  prompt: string,
  setPrompt: (value: string) => void,
  kind: EnhanceKind = "image",
) {
  const { locale } = useI18n();
  const [loading, setLoading] = useState(false);
  /** Text before the last improvement; null when there is nothing to undo. */
  const [previous, setPrevious] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function enhance() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { text } = await enhancePrompt(prompt, locale, kind);
      setPrevious(prompt);
      setPrompt(text);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("unexpected"));
    } finally {
      setLoading(false);
    }
  }

  function undo() {
    if (previous === null) return;
    setPrompt(previous);
    setPrevious(null);
  }

  /** Call from the field's onChange. */
  function edit(value: string) {
    setPrompt(value);
    setPrevious(null);
  }

  return { loading, error, canUndo: previous !== null, enhance, undo, edit, forget: () => setPrevious(null) };
}

export type PromptEnhancer = ReturnType<typeof usePromptEnhancer>;
