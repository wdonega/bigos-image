"use client";

import { CHOICE_ITEM, Field } from "@/components/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/provider";
import { VIDEO_DURATIONS, VIDEO_RATIOS, type VideoDuration, type VideoRatio } from "@/lib/video";

/** Proportion of the video (no Manual: H3 sizes come from the proportion and the Quality). */
export function VideoRatioPicker({
  value,
  onChange,
  disabled,
}: {
  value: VideoRatio;
  onChange: (next: VideoRatio) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Field label={t("size.ratio")}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={value}
        disabled={disabled}
        onValueChange={(v) => v && onChange(v as VideoRatio)}
      >
        {VIDEO_RATIOS.map((r) => (
          <ToggleGroupItem key={r} value={r} className={`min-w-12 ${CHOICE_ITEM}`}>
            {r}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

export function DurationPicker({
  value,
  onChange,
  disabled,
}: {
  value: VideoDuration;
  onChange: (next: VideoDuration) => void;
  disabled?: boolean;
}) {
  const { t, number } = useI18n();
  return (
    <Field label={t("video.duration")} hint={t("video.durationHint")}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="w-full"
        value={String(value)}
        disabled={disabled}
        onValueChange={(v) => v && onChange(Number(v) as VideoDuration)}
      >
        {VIDEO_DURATIONS.map((d) => (
          <ToggleGroupItem key={d} value={String(d)} className={`flex-1 ${CHOICE_ITEM}`}>
            {t("video.seconds", { seconds: number(d, 0) })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
