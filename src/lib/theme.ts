// Color theme preference. Dark is the default until the user picks one in the settings menu.
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "theme";

/** Browser/status bar color per theme: brand orange on light, the dark background on dark. */
export const THEME_BAR_COLORS: Record<Theme, string> = { light: "#ffc87c", dark: "#0a0a0a" };

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function resolveTheme(cookie: string | undefined): Theme {
  return isTheme(cookie) ? cookie : DEFAULT_THEME;
}
