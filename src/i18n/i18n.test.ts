import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../lib/errors";
import { SIZE_PROBLEMS } from "../lib/size";
import { resolveLocale } from "./config";
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

const en = leaves(MESSAGES.en);
const pt = leaves(MESSAGES["pt-BR"]);

describe("message catalogs", () => {
  it("have exactly the same keys", () => {
    expect([...pt.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("have no empty values", () => {
    for (const [key, value] of [...en, ...pt]) expect(value.trim(), key).not.toBe("");
  });

  it("use the same placeholders in every language", () => {
    for (const [key, value] of en) expect(placeholders(pt.get(key) ?? ""), key).toEqual(placeholders(value));
  });

  it("translate every error code and size problem the backend can return", () => {
    for (const code of ERROR_CODES) expect(en.has(`errors.${code}`), code).toBe(true);
    for (const problem of SIZE_PROBLEMS) expect(en.has(`details.${problem}`), problem).toBe(true);
  });
});

describe("translate", () => {
  it("fills placeholders and keeps unknown ones", () => {
    expect(translate(MESSAGES.en, "details.below_min_side", { min: 512 })).toBe("Each side must be at least 512 px.");
    expect(translate(MESSAGES.en, "details.below_min_side")).toBe("Each side must be at least {min} px.");
  });

  it("falls back to the fallback catalog, then to the key", () => {
    expect(translate({ ...MESSAGES.en, nav: {} } as never, "nav.edit", undefined, MESSAGES.en)).toBe("Edit");
    expect(translate(MESSAGES.en, "does.not.exist")).toBe("does.not.exist");
  });
});

describe("resolveLocale", () => {
  it("prefers the cookie", () => {
    expect(resolveLocale("en", "pt-BR,pt;q=0.9")).toBe("en");
  });

  it("follows the first supported browser language", () => {
    expect(resolveLocale(undefined, "en-US,en;q=0.9,pt;q=0.8")).toBe("en");
    expect(resolveLocale(undefined, "fr-FR,pt-PT;q=0.9")).toBe("pt-BR");
  });

  it("defaults to Brazilian Portuguese", () => {
    expect(resolveLocale(undefined, null)).toBe("pt-BR");
    expect(resolveLocale("de", "de-DE")).toBe("pt-BR");
  });
});
