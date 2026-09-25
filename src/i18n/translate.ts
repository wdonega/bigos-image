import type { Messages } from "./messages/en.ts";

/** Dot-separated path of every string leaf, e.g. "generate.title". */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type MessageParams = Record<string, string | number>;

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Looks up `key` and fills `{name}` placeholders. Unknown keys fall back to `fallback`, then to
 * the key itself, so a missing translation never breaks the page.
 */
export function translate(
  messages: Messages,
  key: MessageKey | (string & {}),
  params?: MessageParams,
  fallback?: Messages,
): string {
  const template = lookup(messages, key) ?? (fallback && lookup(fallback, key)) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Placeholder names used in a message, e.g. "{min}" → ["min"]. */
export function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
