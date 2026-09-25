"use client";

import { CHOICE_ITEM, Field } from "@/components/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/provider";

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
  const { t } = useI18n();
  return (
    <Field
      label={t("quality.label")}
      hint={t(value === "high" ? "quality.highHint" : "quality.normalHint")}
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
        <ToggleGroupItem value="normal" className={`flex-1 ${CHOICE_ITEM}`}>
          {t("quality.normal")}
        </ToggleGroupItem>
        <ToggleGroupItem value="high" className={`flex-1 ${CHOICE_ITEM}`}>
          {t("quality.high")}
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
