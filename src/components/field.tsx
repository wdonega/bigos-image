import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Toggle-group option: finger-sized on phones (40 px), compact from `sm` up, and a selected state
 * that is unmistakable for lay users.
 */
export const CHOICE_ITEM =
  "h-10 sm:h-7 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:[&_span]:text-primary-foreground/70";

/** The prompt box: the text and the "Improve text" bar share one card; the card shows focus. */
export const PROMPT_CARD =
  "flex flex-col gap-2 rounded-2xl border border-input bg-card p-3 pb-2.5 transition-colors focus-within:border-ring/70";
export const PROMPT_TEXTAREA =
  "min-h-20 resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent md:text-[15px]";

/** The main action of a screen (Generate / Edit). */
export const SUBMIT_BUTTON = "h-14 rounded-2xl text-base font-semibold [&_svg]:size-5";
