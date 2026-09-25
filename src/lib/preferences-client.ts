// Browser-side preference storage. Preferences live in cookies so the server renders the right
// language and theme on the first paint (no flash); they are kept for a year.
import { THEME_BAR_COLORS, THEME_COOKIE, type Theme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function savePreference(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/** Saves the theme and applies it right away, without a reload. */
export function applyTheme(theme: Theme) {
  savePreference(THEME_COOKIE, theme);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BAR_COLORS[theme]);
}
