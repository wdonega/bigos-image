import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../lib/errors";
import { SIZE_PROBLEMS } from "../lib/size";
import { LOCALES, resolveLocale } from "./config";
import { MESSAGES } from "./messages";
import { placeholders, translate } from "./translate";

/** Every leaf as "path → value". */
function leaves(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [p, v] of leaves(value, path)) out.set(p, v);
  }
  return out;
}

const en = leaves(MESSAGES["en-US"]);
const others = LOCALES.filter((l) => l !== "en-US").map((l) => [l, leaves(MESSAGES[l])] as const);

describe("message catalogs", () => {
  it.each(others)("%s has exactly the keys of en-US", (_locale, catalog) => {
    expect([...catalog.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it.each(LOCALES)("%s has no empty values", (locale) => {
    for (const [key, value] of leaves(MESSAGES[locale])) expect(value.trim(), key).not.toBe("");
  });

  it.each(others)("%s uses the same placeholders as en-US", (_locale, catalog) => {
    for (const [key, value] of en) expect(placeholders(catalog.get(key) ?? ""), key).toEqual(placeholders(value));
  });

  it("translate every error code and size problem the backend can return", () => {
    for (const code of ERROR_CODES) expect(en.has(`errors.${code}`), code).toBe(true);
    for (const problem of SIZE_PROBLEMS) expect(en.has(`details.${problem}`), problem).toBe(true);
  });
});

describe("translate", () => {
  it("fills placeholders and keeps unknown ones", () => {
    const en = MESSAGES["en-US"];
    expect(translate(en, "details.below_min_side", { min: 512 })).toBe("Each side must be at least 512 px.");
    expect(translate(en, "details.below_min_side")).toBe("Each side must be at least {min} px.");
  });

  it("falls back to the fallback catalog, then to the key", () => {
    const en = MESSAGES["en-US"];
    expect(translate({ ...en, nav: {} } as never, "nav.image", undefined, en)).toBe("Image");
    expect(translate(en, "does.not.exist")).toBe("does.not.exist");
  });
});

describe("resolveLocale", () => {
  it("prefers the saved choice, including legacy values", () => {
    expect(resolveLocale("es-MX", "pt-BR,pt;q=0.9")).toBe("es-MX");
    expect(resolveLocale("en", "pt-BR")).toBe("en-US");
  });

  it.each([
    ["pt-PT", "pt-BR"],
    ["pt", "pt-BR"],
    ["es-AR", "es-MX"],
    ["es-ES", "es-MX"],
    ["en-GB", "en-US"],
    ["zh-TW", "zh-CN"],
    ["zh-Hant-HK", "zh-CN"],
  ])("maps every variant of a language: %s → %s", (tag, locale) => {
    expect(resolveLocale(undefined, tag)).toBe(locale);
  });

  it("follows the browser's order of preference", () => {
    expect(resolveLocale(undefined, "fr-FR,es-CL;q=0.9,en;q=0.8")).toBe("es-MX");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale(undefined, "fr-FR,de;q=0.9")).toBe("en-US");
    expect(resolveLocale(undefined, null)).toBe("en-US");
    expect(resolveLocale("de", null)).toBe("en-US");
  });
});
