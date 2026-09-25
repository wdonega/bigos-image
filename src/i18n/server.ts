import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./config.ts";
import { MESSAGES } from "./messages/index.ts";
import { type MessageKey, type MessageParams, translate } from "./translate.ts";

/** Locale of the current request (cookie, then Accept-Language). Server components only. */
export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const acceptLanguage = (await headers()).get("accept-language");
  return resolveLocale(cookie, acceptLanguage);
}

export async function getTranslator() {
  const locale = await getLocale();
  return {
    locale,
    t: (key: MessageKey, params?: MessageParams) => translate(MESSAGES[locale], key, params, MESSAGES.en),
  };
}
