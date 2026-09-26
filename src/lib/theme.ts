// Color theme preference. Dark is the default until the user picks one in the settings menu.
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "theme";

/** Browser/status bar color per theme: the page background. */
export const THEME_BAR_COLORS: Record<Theme, string> = { light: "#fbf6ee", dark: "#120f0d" };

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function resolveTheme(cookie: string | undefined): Theme {
  return isTheme(cookie) ? cookie : DEFAULT_THEME;
}
