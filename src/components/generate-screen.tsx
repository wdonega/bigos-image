"use client";

import { SparklesIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AdvancedOptions } from "@/components/advanced-options";
import { Field } from "@/components/field";
import { JobPanel } from "@/components/job-panel";
import { type Quality, QualityPicker } from "@/components/quality-picker";
import { SizePicker } from "@/components/size-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJob } from "@/hooks/use-job";
import { ApiError, TERMINAL, cancelJob, createJob } from "@/lib/client/api";
import type { ScreenLimits } from "@/lib/screen-limits";
import { DEFAULT_GENERATE_SELECTION, type SizeSelection, selectionProblems, toRequestSize } from "@/lib/size-selection";

export function GenerateScreen({ limits }: { limits: ScreenLimits }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<SizeSelection>(DEFAULT_GENERATE_SELECTION);
  const [quality, setQuality] = useState<Quality>("normal");
  const [seed, setSeed] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);
  const view = useJob(jobId);

  const running = jobId !== null && (view === null || !TERMINAL.has(view.status));
  const sizeInvalid = selectionProblems(size, limits).length > 0;
  const canSubmit = prompt.trim().length > 0 && !sizeInvalid && !running && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const id = await createJob({
        screen: "generate",
        prompt,
        images: [],
        size: toRequestSize(size),
        quality,
        transparent_background: false,
        seed: seed === "" ? null : Number(seed),
      });
      setJobId(id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err : new ApiError("unexpected", "Algo deu errado. Tente de novo."));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!jobId) return;
    setCancelling(true);
    await cancelJob(jobId).catch(() => {});
    setCancelling(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label="O que você quer criar?" htmlFor="prompt">
          <Textarea
            id="prompt"
            rows={5}
            placeholder="Ex.: um farol numa costa rochosa ao pôr do sol, foto realista"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
        </Field>

        <SizePicker value={size} onChange={setSize} limits={limits} disabled={running} />
        <QualityPicker value={quality} onChange={setQuality} disabled={running} />
        <AdvancedOptions seed={seed} onSeedChange={setSeed} disabled={running} />

        {formError && (
          <Alert variant="destructive">
            <AlertTitle>{formError.message}</AlertTitle>
            {formError.details.length > 0 && (
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {formError.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}

        <Button type="submit" size="lg" disabled={!canSubmit}>
          <SparklesIcon aria-hidden />
          {running || submitting ? "Gerando…" : "Gerar imagem"}
        </Button>
      </form>

      <JobPanel jobId={jobId} view={view} onCancel={cancel} cancelling={cancelling} />
    </div>
  );
}
