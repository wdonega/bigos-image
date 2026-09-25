"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n/provider";

/** Transparent background (spec §8.2): the backend wraps the prompt; output stays PNG. */
export function TransparencyToggle({
  checked,
  onChange,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Defaults to the Generate screen hint. */
  hint?: string;
}) {
  const { t } = useI18n();
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
          {t("transparency.label")}
        </span>
        <p id="transparent-hint" className="text-xs text-muted-foreground">
          {hint ?? t("transparency.hint")}
        </p>
      </div>
    </label>
  );
}
