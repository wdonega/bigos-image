// The jobs this browser sent (spec §14, decision 33): kept in localStorage so the jobs menu can list
// them after the user leaves a screen or closes the app. Only ids and what the list shows are kept;
// the state of each job comes from the server. Pure functions; the provider does the reading.

export const JOB_SCREENS = ["generate", "video", "music", "effects", "restore"] as const;
export type JobScreen = (typeof JOB_SCREENS)[number];

/** The page each screen lives on (the "Open" link adds `?job=<id>`). */
export const SCREEN_PATHS: Record<JobScreen, string> = {
  generate: "/image",
  video: "/video",
  music: "/music",
  effects: "/effects",
  restore: "/restore",
};

export type JobEntry = {
  id: string;
  screen: JobScreen;
  /** What the user typed, or the video's file name: the line the list shows. */
  label: string;
  /** Effects: which one (named in the list instead of the tab). */
  effect?: string;
  /** The request as sent, for "Try again" from the list. */
  request: unknown;
  /** ms since the epoch. */
  createdAt: number;
  /** The user saw it finish (on its screen, or opened the menu after). */
  seen: boolean;
};

export const STORAGE_KEY = "bigos.jobs.v1";

function isEntry(value: unknown): value is JobEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    JOB_SCREENS.includes(e.screen as JobScreen) &&
    typeof e.label === "string" &&
    typeof e.createdAt === "number" &&
    typeof e.seen === "boolean"
  );
}

/** Parses what localStorage holds; anything malformed is dropped rather than breaking the menu. */
export function parseEntries(raw: string | null): JobEntry[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Drops jobs past the retention window (the server deleted them and their files). */
export function pruneEntries(entries: JobEntry[], now: number, retentionMs: number): JobEntry[] {
  return entries.filter((e) => now - e.createdAt < retentionMs);
}

/** Newest first; an entry with the same id is replaced. */
export function addEntry(entries: JobEntry[], entry: JobEntry): JobEntry[] {
  return [entry, ...entries.filter((e) => e.id !== entry.id)];
}

export function updateEntry(entries: JobEntry[], id: string, change: Partial<JobEntry>): JobEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, ...change } : e));
}

/** The job page address: its screen with `?job=<id>`. */
export function jobHref(entry: Pick<JobEntry, "id" | "screen">): string {
  return `${SCREEN_PATHS[entry.screen]}?job=${encodeURIComponent(entry.id)}`;
}
