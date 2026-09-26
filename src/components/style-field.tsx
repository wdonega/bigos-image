"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { StyleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/provider";
import { STYLES, STYLE_CATEGORIES, type StyleCategory, type StyleId, findStyle } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Sample image of a style (same subject in every style), made by scripts/generate-style-thumbnails.ts. */
const thumb = (id: StyleId) => `/styles/${id}.webp`;

/** "Style" field: none → Choose; chosen → name + Change + remove. Choosing opens the full list. */
export function StyleField({
  value,
  onChange,
  disabled,
}: {
  value: StyleId | null;
  onChange: (value: StyleId | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const style = value ? findStyle(value) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("stylePicker.label")}</span>
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-2">
        {style ? (
          // eslint-disable-next-line @next/next/no-img-element -- static sample, no optimization needed
          <img src={thumb(style.id)} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
            <StyleIcon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{style ? t(`styles.${style.id}`) : t("stylePicker.none")}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {style ? t(`styleCategories.${style.category}`) : t("stylePicker.noneHint")}
          </p>
        </div>
        {style ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
              {t("stylePicker.change")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={t("stylePicker.remove")}
              title={t("stylePicker.remove")}
            >
              <XIcon aria-hidden />
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
            {t("stylePicker.choose")}
          </Button>
        )}
      </div>
      <StyleDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onPick={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </div>
  );
}

function StyleDialog({
  open,
  onOpenChange,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: StyleId | null;
  onPick: (id: StyleId) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StyleCategory | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    return STYLES.filter(
      (s) =>
        (!category || s.category === category) &&
        (!q || t(`styles.${s.id}`).toLocaleLowerCase(locale).includes(q)),
    );
  }, [query, category, t, locale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-4 sm:max-w-4xl"
        closeLabel={t("stylePicker.close")}
        // Phones: focusing the search would open the keyboard over the styles.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("stylePicker.title")}</DialogTitle>
          <DialogDescription>{t("stylePicker.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("stylePicker.search")}
            aria-label={t("stylePicker.search")}
            className="pl-8"
          />
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap">
          <CategoryChip active={category === null} onClick={() => setCategory(null)}>
            {t("stylePicker.all")}
          </CategoryChip>
          {STYLE_CATEGORIES.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {t(`styleCategories.${c}`)}
            </CategoryChip>
          ))}
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-1">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("stylePicker.empty")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
              {visible.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s.id)}
                    aria-pressed={s.id === value}
                    className="group flex w-full flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- static sample, no optimization needed */}
                    <img
                      src={thumb(s.id)}
                      alt=""
                      loading="lazy"
                      className={cn(
                        "aspect-square w-full rounded-lg bg-muted object-cover ring-1 ring-border transition group-hover:ring-2 group-hover:ring-primary/60",
                        s.id === value && "ring-2 ring-primary group-hover:ring-primary",
                      )}
                    />
                    <span className={cn("text-xs leading-tight", s.id === value && "font-medium text-primary")}>
                      {t(`styles.${s.id}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-xs whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
