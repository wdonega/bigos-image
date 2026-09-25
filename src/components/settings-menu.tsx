"use client";

import { MoonIcon, SettingsIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_COOKIE, LOCALE_INFO, type Locale, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { applyTheme, savePreference } from "@/lib/preferences-client";
import { type Theme, isTheme } from "@/lib/theme";

/** Gear menu in the header: color theme and language, both remembered in the browser. */
export function SettingsMenu({ initialTheme }: { initialTheme: Theme }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);

  function chooseTheme(value: string) {
    if (!isTheme(value)) return;
    setTheme(value);
    applyTheme(value);
  }

  function chooseLocale(value: string) {
    if (!isLocale(value) || value === locale) return;
    savePreference(LOCALE_COOKIE, value);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="ml-auto size-10 sm:size-9" aria-label={t("settings.title")}>
          <SettingsIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("settings.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={chooseTheme}>
          <DropdownMenuRadioItem value="light" className="min-h-10 sm:min-h-8">
            <SunIcon aria-hidden /> {t("settings.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="min-h-10 sm:min-h-8">
            <MoonIcon aria-hidden /> {t("settings.dark")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("settings.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={chooseLocale}>
          {LOCALES.map((option: Locale) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option} className="min-h-10 sm:min-h-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- 1–2 KB static flag */}
              <img
                src={LOCALE_INFO[option].flag}
                alt=""
                width={20}
                height={15}
                className="h-[15px] w-5 rounded-[2px] object-cover ring-1 ring-border"
              />
              {LOCALE_INFO[option].name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
