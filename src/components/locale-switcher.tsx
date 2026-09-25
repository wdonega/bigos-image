"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { "pt-BR": "PT", en: "EN" };

/** Remembers the choice for a year; the server reads it on the next render. */
function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** PT | EN toggle; the choice is kept in a cookie for a year and applied on the server. */
export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();

  function choose(next: Locale) {
    persistLocale(next);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t("app.language")} className="ml-auto flex rounded-md border p-0.5">
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          onClick={() => choose(option)}
          className={cn(
            "flex h-9 min-w-10 items-center justify-center rounded px-2 text-xs font-medium text-muted-foreground sm:h-7",
            option === locale && "bg-primary text-primary-foreground",
          )}
        >
          {SHORT[option]}
        </button>
      ))}
    </div>
  );
}
