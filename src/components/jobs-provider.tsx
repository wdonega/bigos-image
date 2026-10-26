"use client";

import Link from "next/link";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { type JobView, TERMINAL, cancelJob, createJob, getJobViews } from "@/lib/client/api";
import {
  type JobEntry,
  STORAGE_KEY,
  addEntry,
  jobHref,
  parseEntries,
  pruneEntries,
  updateEntry,
} from "@/lib/client/job-history";

/** How often the menu asks for the state of unfinished jobs. */
const POLL_MS = 2_000;
/** How long a "finished" notice stays on screen. */
const TOAST_MS = 8_000;

type NewEntry = Omit<JobEntry, "createdAt" | "seen">;
type Toast = { id: string; entry: JobEntry; status: "done" | "failed" };

type JobsContextValue = {
  entries: JobEntry[];
  views: Record<string, JobView>;
  add: (entry: NewEntry) => void;
  /** The job a screen is showing: it is seen when it finishes there, without a notice. */
  watch: (id: string | null) => void;
  markAllSeen: () => void;
  clearFinished: () => void;
  cancel: (id: string) => Promise<void>;
  /** Sends the job's request again; returns the new job's id. */
  retry: (id: string) => Promise<string | null>;
};

const JobsContext = createContext<JobsContextValue | null>(null);

export function useJobs(): JobsContextValue {
  const value = useContext(JobsContext);
  if (!value) throw new Error("useJobs must be used inside <JobsProvider>");
  return value;
}

function readStorage(): JobEntry[] {
  try {
    return parseEntries(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStorage(entries: JobEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private mode or full storage: the menu still works for this visit.
  }
}

/** The jobs this browser sent (spec §14, decision 33): list, live state, notices and the tab title count. */
export function JobsProvider({ retentionMs, children }: { retentionMs: number; children: ReactNode }) {
  const [entries, setEntries] = useState<JobEntry[]>([]);
  const [views, setViews] = useState<Record<string, JobView>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);
  const watched = useRef<string | null>(null);
  const entriesRef = useRef(entries);
  const viewsRef = useRef(views);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Read once on the client (localStorage does not exist on the server), and follow other tabs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setEntries(pruneEntries(readStorage(), Date.now(), retentionMs));
    setLoaded(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setEntries(pruneEntries(parseEntries(event.newValue), Date.now(), retentionMs));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [retentionMs]);

  useEffect(() => {
    if (loaded) writeStorage(entries);
  }, [entries, loaded]);

  // Jobs whose state may still change: never asked yet, or not finished.
  const pending = entries
    .filter((e) => !views[e.id] || !TERMINAL.has(views[e.id].status))
    .map((e) => e.id)
    .join(",");

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    const poll = async () => {
      const result = await getJobViews(pending.split(",")).catch(() => null);
      if (stopped || !result) return;
      const gone = Object.keys(result).filter((id) => result[id] === null);
      const finished: Toast[] = [];
      for (const [id, view] of Object.entries(result)) {
        const was = viewsRef.current[id];
        // A notice only for a change seen live, not for jobs that finished while the app was closed.
        if (view && was && !TERMINAL.has(was.status) && (view.status === "done" || view.status === "failed")) {
          const entry = entriesRef.current.find((e) => e.id === id);
          if (entry && !entry.seen && watched.current !== id) finished.push({ id, entry, status: view.status });
        }
      }
      const live = Object.fromEntries(Object.entries(result).filter((pair): pair is [string, JobView] => pair[1] !== null));
      viewsRef.current = { ...viewsRef.current, ...live };
      setViews(viewsRef.current);
      setEntries((list) => {
        // Jobs the server no longer has (past retention) leave the list.
        let next = gone.length ? list.filter((e) => !gone.includes(e.id)) : list;
        // Finishing on the screen that shows it counts as seen.
        const here = watched.current;
        const view = here ? result[here] : null;
        if (here && view && TERMINAL.has(view.status)) next = updateEntry(next, here, { seen: true });
        return next;
      });
      if (finished.length) setToasts((list) => [...list.filter((t) => !finished.some((f) => f.id === t.id)), ...finished]);
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending]);

  const add = useCallback((entry: NewEntry) => {
    setEntries((list) => addEntry(list, { ...entry, createdAt: Date.now(), seen: false }));
  }, []);

  const watch = useCallback((id: string | null) => {
    watched.current = id;
    // Opening a finished job on its screen counts as seeing it; one still running is seen when it ends there.
    const view = id ? viewsRef.current[id] : undefined;
    if (id && view && TERMINAL.has(view.status)) {
      setEntries((list) => (list.some((e) => e.id === id && !e.seen) ? updateEntry(list, id, { seen: true }) : list));
    }
  }, []);

  const markAllSeen = useCallback(() => {
    setEntries((list) => (list.some((e) => !e.seen) ? list.map((e) => ({ ...e, seen: true })) : list));
  }, []);

  const clearFinished = useCallback(() => {
    setEntries((list) => list.filter((e) => !views[e.id] || !TERMINAL.has(views[e.id].status)));
  }, [views]);

  const cancel = useCallback(async (id: string) => {
    const view = await cancelJob(id).catch(() => null);
    if (!view) return;
    viewsRef.current = { ...viewsRef.current, [id]: view };
    setViews(viewsRef.current);
  }, []);

  const retry = useCallback(async (id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    if (!entry) return null;
    const newId = await createJob(entry.request).catch(() => null);
    if (!newId) return null;
    setEntries((list) => addEntry(list.filter((e) => e.id !== id), { ...entry, id: newId, createdAt: Date.now(), seen: false }));
    return newId;
  }, []);

  // Finished jobs the user hasn't looked at yet go in front of the tab title: "(2) Bigos".
  const unseen = entries.filter((e) => !e.seen && (views[e.id]?.status === "done" || views[e.id]?.status === "failed")).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unseen ? `(${unseen}) ${base}` : base;
  }, [unseen]);

  const closeToast = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const value = useMemo(
    () => ({ entries, views, add, watch, markAllSeen, clearFinished, cancel, retry }),
    [entries, views, add, watch, markAllSeen, clearFinished, cancel, retry],
  );

  return (
    <JobsContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6">
        {toasts.map((toast) => (
          <JobToast key={toast.id} toast={toast} onClose={closeToast} />
        ))}
      </div>
    </JobsContext.Provider>
  );
}

/** What kind of job it is, as the list and the notices name it. */
export function useJobKind() {
  const { t } = useI18n();
  return (entry: Pick<JobEntry, "screen" | "effect">) =>
    entry.effect ? t(`effects.names.${entry.effect}`) : t(`jobs.kinds.${entry.screen}`);
}

function JobToast({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const { t } = useI18n();
  const kind = useJobKind();
  const { markAllSeen } = useJobs();

  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [onClose, toast.id]);

  const ok = toast.status === "done";
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-foreground py-2.5 pr-1.5 pl-3 text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${ok ? "bg-emerald-600" : "bg-destructive"}`}
        aria-hidden
      >
        {ok ? <CheckIcon className="size-4" /> : <TriangleAlertIcon className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{t(ok ? "jobs.toastDone" : "jobs.toastFailed", { kind: kind(toast.entry) })}</span>
        <span className="truncate text-xs opacity-75">{toast.entry.label}</span>
      </div>
      <Link
        href={jobHref(toast.entry)}
        onClick={() => {
          markAllSeen();
          onClose(toast.id);
        }}
        className="flex h-10 items-center rounded-lg px-2 text-sm font-semibold underline underline-offset-4"
      >
        {t("jobs.open")}
      </Link>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label={t("jobs.closeNotice")}
        className="flex size-10 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
