"use client";

import { CHOICE_ON, Field } from "@/components/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Quality = "normal" | "high";

export function QualityPicker({
  value,
  onChange,
  disabled,
}: {
  value: Quality;
  onChange: (next: Quality) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Qualidade"
      hint={value === "high" ? "Mais detalhes, mas demora cerca de 50% a mais." : "Boa para a maioria dos casos."}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="w-full"
        value={value}
        disabled={disabled}
        onValueChange={(v) => v && onChange(v as Quality)}
      >
        <ToggleGroupItem value="normal" className={`flex-1 ${CHOICE_ON}`}>
          Normal
        </ToggleGroupItem>
        <ToggleGroupItem value="high" className={`flex-1 ${CHOICE_ON}`}>
          Alta
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
