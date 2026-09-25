import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages";
import { LOCALES } from "../i18n/config";
import { STYLES, STYLE_CATEGORIES, applyStyle } from "./styles";

describe("styles", () => {
  it("have unique ids and a category from the list", () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    for (const s of STYLES) expect(STYLE_CATEGORIES).toContain(s.category);
  });

  it.each(LOCALES)("every style and category has a name in %s", (locale) => {
    const m = MESSAGES[locale] as unknown as {
      styles: Record<string, string>;
      styleCategories: Record<string, string>;
    };
    for (const s of STYLES) expect(m.styles[s.id], s.id).toBeTruthy();
    for (const c of STYLE_CATEGORIES) expect(m.styleCategories[c], c).toBeTruthy();
  });

  it("appends the style phrase, or leaves the prompt alone without a style", () => {
    expect(applyStyle("a cat.", "watercolor")).toBe("a cat. watercolor painting, soft washes, paper texture.");
    expect(applyStyle("  um gato  ", null)).toBe("  um gato  ");
  });
});
