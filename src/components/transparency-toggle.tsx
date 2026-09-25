"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id="transparent"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="transparent" className="text-sm font-medium">
          Fundo transparente
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
