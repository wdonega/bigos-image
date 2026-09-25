"use client";

import { SparklesIcon } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { AdvancedOptions } from "@/components/advanced-options";
import { Field } from "@/components/field";
import { FormError } from "@/components/form-error";
import { JobPanel } from "@/components/job-panel";
import { type Quality, QualityPicker } from "@/components/quality-picker";
import { ReferencePicker } from "@/components/reference-picker";
import { SizePicker } from "@/components/size-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJobRunner } from "@/hooks/use-job-runner";
import { useUploads } from "@/hooks/use-uploads";
import { mentionLabel, renumberMentions } from "@/lib/mentions";
import type { ScreenLimits } from "@/lib/screen-limits";
import { DEFAULT_GENERATE_SELECTION, type SizeSelection, selectionProblems, toRequestSize } from "@/lib/size-selection";

export function GenerateScreen({ limits }: { limits: ScreenLimits }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<SizeSelection>(DEFAULT_GENERATE_SELECTION);
  const [quality, setQuality] = useState<Quality>("normal");
  const [seed, setSeed] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const job = useJobRunner();
  const uploads = useUploads(limits.maxRefs, (order) => setPrompt((p) => renumberMentions(p, order)));

  const canSubmit =
    prompt.trim().length > 0 &&
    selectionProblems(size, limits).length === 0 &&
    uploads.ready &&
    !job.busy;

  function insertMention(n: number) {
    const el = promptRef.current;
    const text = `${mentionLabel(n)} `;
    const start = el?.selectionStart ?? prompt.length;
    const end = el?.selectionEnd ?? prompt.length;
    setPrompt(prompt.slice(0, start) + text + prompt.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void job.submit({
      screen: "generate",
      prompt,
      images: uploads.ids,
      size: toRequestSize(size),
      quality,
      transparent_background: false,
      seed: seed === "" ? null : Number(seed),
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label="O que você quer criar?" htmlFor="prompt">
          <Textarea
            id="prompt"
            ref={promptRef}
            rows={5}
            placeholder="Ex.: um farol numa costa rochosa ao pôr do sol, foto realista"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
        </Field>

        <ReferencePicker uploads={uploads} max={limits.maxRefs} disabled={job.busy} onMention={insertMention} />
        <SizePicker value={size} onChange={setSize} limits={limits} disabled={job.busy} />
        <QualityPicker value={quality} onChange={setQuality} disabled={job.busy} />
        <AdvancedOptions seed={seed} onSeedChange={setSeed} disabled={job.busy} />
        <FormError error={job.error} />

        <Button type="submit" size="lg" disabled={!canSubmit}>
          <SparklesIcon aria-hidden />
          {job.busy ? "Gerando…" : uploads.ready ? "Gerar imagem" : "Enviando imagens…"}
        </Button>
      </form>

      <JobPanel jobId={job.jobId} view={job.view} onCancel={job.cancel} cancelling={job.cancelling} />
    </div>
  );
}
