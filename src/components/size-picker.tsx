"use client";

import { LockIcon, TriangleAlertIcon } from "lucide-react";
import { CHOICE_ITEM, Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/provider";
import { sizeProblemDetails } from "@/lib/errors";
import { MEGAPIXEL_OPTIONS, type Megapixels, PRESET_RATIOS, type Size, type SizeLimits, megapixelsOf } from "@/lib/size";
import {
  MEGAPIXEL_LABEL_KEYS,
  type RatioChoice,
  type SizeSelection,
  allowedMegapixels,
  changeRatio,
  roundSide,
  selectionProblems,
  selectionSize,
} from "@/lib/size-selection";

function SizeReadout({ size, locked }: { size: Size; locked: boolean }) {
  const { number } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm tabular-nums">
      {locked && <LockIcon className="size-3.5 text-muted-foreground" aria-hidden />}
      <span className="font-medium">
        {size.width} × {size.height} px
      </span>
      <span className="text-muted-foreground">· {number(megapixelsOf(size))} MP</span>
    </div>
  );
}

export function SizePicker({
  value,
  onChange,
  limits,
  original,
  allowOriginal = false,
  disabled = false,
}: {
  value: SizeSelection;
  onChange: (next: SizeSelection) => void;
  limits: SizeLimits;
  /** Size of the image the "Original" option follows (Edit screen). */
  original?: Size | null;
  allowOriginal?: boolean;
  disabled?: boolean;
}) {
  const { t, detail } = useI18n();
  const ratios: RatioChoice[] = [...PRESET_RATIOS, "manual", ...(allowOriginal ? ["original" as const] : [])];
  const size = selectionSize(value, limits.maxPixels, original ?? null);
  const problems = sizeProblemDetails(selectionProblems(value, limits), limits);
  const isPreset = value.ratio !== "manual" && value.ratio !== "original";
  const allowed = isPreset ? allowedMegapixels(value.ratio as (typeof PRESET_RATIOS)[number], limits) : [];

  const setSide = (side: "width" | "height", raw: string) =>
    onChange({ ...value, [side]: Number.parseInt(raw.replace(/\D/g, "").slice(0, 5), 10) || 0 });

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("size.ratio")}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex w-full flex-wrap"
          value={value.ratio}
          disabled={disabled}
          onValueChange={(ratio) => ratio && onChange(changeRatio(value, ratio as RatioChoice, limits, original))}
        >
          {ratios.map((ratio) => (
            <ToggleGroupItem key={ratio} value={ratio} className={`min-w-12 ${CHOICE_ITEM}`}>
              {ratio === "manual" ? t("size.manual") : ratio === "original" ? t("size.original") : ratio}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {isPreset && (
        <Field label={t("size.resolution")}>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            className="w-full"
            value={String(value.megapixels)}
            disabled={disabled}
            onValueChange={(v) => v && onChange({ ...value, megapixels: Number(v) as Megapixels })}
          >
            {MEGAPIXEL_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option}
                value={String(option)}
                disabled={!allowed.includes(option)}
                className={`flex-1 ${CHOICE_ITEM}`}
              >
                {t(MEGAPIXEL_LABEL_KEYS[option])} <span className="text-muted-foreground">{option} MP</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      )}

      {value.ratio === "manual" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("size.width")} htmlFor="size-width">
            <Input
              id="size-width"
              className="h-10 sm:h-8"
              type="number"
              inputMode="numeric"
              step={32}
              value={value.width || ""}
              disabled={disabled}
              onChange={(e) => setSide("width", e.target.value)}
              onBlur={() => onChange({ ...value, width: roundSide(value.width) })}
            />
          </Field>
          <Field label={t("size.height")} htmlFor="size-height">
            <Input
              id="size-height"
              className="h-10 sm:h-8"
              type="number"
              inputMode="numeric"
              step={32}
              value={value.height || ""}
              disabled={disabled}
              onChange={(e) => setSide("height", e.target.value)}
              onBlur={() => onChange({ ...value, height: roundSide(value.height) })}
            />
          </Field>
        </div>
      )}

      {size ? (
        <SizeReadout size={size} locked={value.ratio !== "manual"} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("size.followsImage")}</p>
      )}

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-destructive" role="alert">
          {problems.map((problem) => (
            <li key={problem.code} className="flex items-start gap-1.5">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {detail("details", problem)}
            </li>
          ))}
        </ul>
      )}
      {value.ratio === "manual" && (
        <p className="text-xs text-muted-foreground">{t("size.roundingHint")}</p>
      )}
    </div>
  );
}
