"use client";

import { CHOICE_ITEM, Field } from "@/components/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/provider";

export type Quality = "normal" | "high";

export function QualityPicker({
  value,
  onChange,
  disabled,
  hints,
}: {
  value: Quality;
  onChange: (next: Quality) => void;
  disabled?: boolean;
  /** Overrides the image hints (on video, Quality is sharpness, not steps). */
  hints?: Record<Quality, string>;
}) {
  const { t } = useI18n();
  const hint = hints ? hints[value] : t(value === "high" ? "quality.highHint" : "quality.normalHint");
  return (
    <Field label={t("quality.label")} hint={hint}>
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
