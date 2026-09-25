// Supported UI languages. Code and message keys are English; values exist in every locale.
export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

/** Native name (always shown in its own language) and flag of each locale, for the settings menu. */
export const LOCALE_INFO: Record<Locale, { name: string; flag: string }> = {
  "pt-BR": { name: "Português (Brasil)", flag: "/flags/br.png" },
  en: { name: "English (US)", flag: "/flags/us.png" },
};
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie wins; otherwise the first Accept-Language tag we support; otherwise the default. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
