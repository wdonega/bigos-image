"use client";

import { TriangleAlertIcon, WandSparklesIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Field } from "@/components/field";
import { FormError } from "@/components/form-error";
import { ImageDrop } from "@/components/image-drop";
import { JobPanel } from "@/components/job-panel";
import { type Quality, QualityPicker } from "@/components/quality-picker";
import { SizePicker } from "@/components/size-picker";
import { TransparencyToggle } from "@/components/transparency-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJobRunner } from "@/hooks/use-job-runner";
import { useUploads } from "@/hooks/use-uploads";
import type { ScreenLimits } from "@/lib/screen-limits";
import {
  DEFAULT_GENERATE_SELECTION,
  type SizeSelection,
  differentAspect,
  selectionProblems,
  selectionSize,
  toRequestSize,
} from "@/lib/size-selection";

export function EditScreen({ limits }: { limits: ScreenLimits }) {
  const [instruction, setInstruction] = useState("");
  const [size, setSize] = useState<SizeSelection>({ ...DEFAULT_GENERATE_SELECTION, ratio: "original" });
  const [quality, setQuality] = useState<Quality>("normal");
  const [transparent, setTransparent] = useState(false);
  const job = useJobRunner();
  const uploads = useUploads(1);
  const item = uploads.items[0];
  const upload = item?.upload;

  const original = upload ? { width: upload.sentWidth, height: upload.sentHeight } : null;
  const output = selectionSize(size, limits.maxPixels, original);
  const aspectChanged = size.ratio !== "original" && original && output && differentAspect(output, original);

  const canSubmit =
    instruction.trim().length > 0 &&
    upload !== undefined &&
    selectionProblems(size, limits).length === 0 &&
    !job.busy;

  function replaceImage(file: File) {
    uploads.clear();
    uploads.add([file]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !upload) return;
    void job.submit({
      screen: "edit",
      prompt: instruction,
      images: [upload.id],
      size: toRequestSize(size),
      quality,
      transparent_background: transparent,
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Imagem">
          <ImageDrop item={item} onFile={replaceImage} disabled={job.busy} />
        </Field>

        <Field label="O que você quer mudar?" htmlFor="instruction">
          <Textarea
            id="instruction"
            rows={4}
            placeholder="Ex.: troque o fundo por uma praia"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
        </Field>

        <SizePicker
          value={size}
          onChange={setSize}
          limits={limits}
          original={original}
          allowOriginal
          disabled={job.busy}
        />
        {aspectChanged && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400" role="status">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            A proporção escolhida é diferente da imagem original. Partes da imagem podem ser cortadas ou
            reposicionadas.
          </p>
        )}
        <QualityPicker value={quality} onChange={setQuality} disabled={job.busy} />
        <TransparencyToggle
          checked={transparent}
          onChange={setTransparent}
          disabled={job.busy}
          hint="Funciona quando a imagem já tem um objeto ou personagem sobre um fundo simples. Em fotos com cenário completo o fundo costuma continuar."
        />
        <FormError error={job.error} />

        <Button type="submit" size="lg" className="h-12 text-base sm:h-9 sm:text-sm" disabled={!canSubmit}>
          <WandSparklesIcon aria-hidden />
          {job.busy ? "Editando…" : "Editar imagem"}
        </Button>
      </form>

      <JobPanel jobId={job.jobId} view={job.view} onCancel={job.cancel} cancelling={job.cancelling} />
    </div>
  );
}
