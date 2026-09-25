"use client";

import { type ReactNode, createContext, useContext, useMemo } from "react";
import { FALLBACK_LOCALE, type Locale } from "./config";
import { MESSAGES } from "./messages";
import { type MessageKey, type MessageParams, translate } from "./translate";

type Detail = { code: string; params?: MessageParams };

const LocaleContext = createContext<Locale | null>(null);

/** Makes the request locale (resolved on the server) available to client components. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useI18n must be used inside <I18nProvider>");

  return useMemo(() => {
    const t = (key: MessageKey | (string & {}), params?: MessageParams) =>
      translate(MESSAGES[locale], key, params, MESSAGES[FALLBACK_LOCALE]);
    return {
      locale,
      t,
      /** Translates a backend detail/warning ({ code, params }) from the given namespace. */
      detail: (namespace: "details" | "warnings", item: Detail | string) =>
        typeof item === "string" ? item : t(`${namespace}.${item.code}`, item.params),
      number: (value: number, digits = 1) =>
        value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 }),
    };
  }, [locale]);
}
