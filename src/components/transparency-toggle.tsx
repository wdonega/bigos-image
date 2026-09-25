"use client";

import { Checkbox } from "@/components/ui/checkbox";

/** "Fundo transparente" (spec §8.2): the backend wraps the prompt; output stays PNG. */
export function TransparencyToggle({
  checked,
  onChange,
  disabled,
  hint = "A imagem sai em PNG sem fundo. Funciona melhor com um objeto ou personagem em destaque.",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label htmlFor="transparent" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id="transparent"
        aria-labelledby="transparent-label"
        aria-describedby="transparent-hint"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5 size-5 sm:size-4"
      />
      <div className="flex flex-col gap-1">
        <span id="transparent-label" className="text-sm font-medium">
          Fundo transparente
        </span>
        <p id="transparent-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </label>
  );
}
