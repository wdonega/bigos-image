// Supported UI languages. Code and message keys are English; values exist in every locale.
export const LOCALES = ["pt-BR", "en-US", "es-MX", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];

/** Used when the browser asks for no supported language, and for missing messages. */
export const FALLBACK_LOCALE: Locale = "en-US";
export const LOCALE_COOKIE = "locale";

/** Native name (always shown in its own language) and flag of each locale, for the settings menu. */
export const LOCALE_INFO: Record<Locale, { name: string; flag: string }> = {
  "pt-BR": { name: "Português (Brasil)", flag: "/flags/br.png" },
  "en-US": { name: "English (US)", flag: "/flags/us.png" },
  "es-MX": { name: "Español (México)", flag: "/flags/mx.png" },
  "zh-CN": { name: "中文（简体）", flag: "/flags/cn.png" },
};

/** Every variant of a language maps to the one we ship: pt-PT → pt-BR, es-AR → es-MX, zh-TW → zh-CN. */
const BY_LANGUAGE: Record<string, Locale> = { pt: "pt-BR", en: "en-US", es: "es-MX", zh: "zh-CN" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Maps any BCP 47 tag (or a legacy cookie value like "en") to a supported locale. */
export function matchLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  if (isLocale(tag)) return tag;
  return BY_LANGUAGE[tag.trim().toLowerCase().split(/[-_]/)[0]] ?? null;
}

/** Saved choice first; then the browser's languages in order of preference; then English. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  const saved = matchLocale(cookie);
  if (saved) return saved;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const locale = matchLocale(part.split(";")[0]);
    if (locale) return locale;
  }
  return FALLBACK_LOCALE;
}
