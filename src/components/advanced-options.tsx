"use client";

import { ChevronDownIcon } from "lucide-react";
import { Field } from "@/components/field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

/** Seed stays hidden from lay users (spec §4): empty = a new random one each time. */
export function AdvancedOptions({
  seed,
  onSeedChange,
  disabled,
}: {
  seed: string;
  onSeedChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        Avançado
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">
        <Field
          label="Semente (seed)"
          htmlFor="seed"
          hint="Deixe vazio para variar a cada geração. Repita um número para reproduzir um resultado."
        >
          <Input
            id="seed"
            inputMode="numeric"
            placeholder="Aleatória"
            value={seed}
            disabled={disabled}
            onChange={(e) => onSeedChange(e.target.value.replace(/\D/g, "").slice(0, 15))}
          />
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}
