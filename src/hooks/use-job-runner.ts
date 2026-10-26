"use client";

import { useEffect, useRef, useState } from "react";
import { useJobs } from "@/components/jobs-provider";
import { useJob } from "@/hooks/use-job";
import { ApiError, TERMINAL, cancelJob, createJob } from "@/lib/client/api";
import { type JobScreen, jobHref } from "@/lib/client/job-history";

/** What the jobs menu shows for a request: the user's text or the video's file name, and the effect. */
export type JobLabel = { label: string; effect?: string };

/**
 * Submits a job, follows it and cancels it; shared by every screen. Each job goes in the jobs menu
 * and in the address (`?job=<id>`), so a reload or "Open" from the menu shows it again
 * (spec §14, decision 33).
 */
export function useJobRunner(screen: JobScreen, initialJobId: string | null = null) {
  const { add, watch, retry: retryFromList } = useJobs();
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const last = useRef<{ request: unknown; label: JobLabel } | null>(null);
  const view = useJob(jobId);
  const running = jobId !== null && (view === null || !TERMINAL.has(view.status));

  useEffect(() => {
    watch(jobId);
    return () => watch(null);
  }, [jobId, watch]);

  async function submit(request: unknown, label: JobLabel) {
    last.current = { request, label };
    setSubmitting(true);
    setError(null);
    try {
      const id = await createJob(request);
      add({ id, screen, request, ...label });
      setJobId(id);
      // Not router.replace: the page would render again and reset the form.
      window.history.replaceState(null, "", jobHref({ id, screen }));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("unexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!jobId) return;
    setCancelling(true);
    await cancelJob(jobId).catch(() => {});
    setCancelling(false);
  }

  /** Sends the request again ("Try again" after a failure); a job reopened from the menu uses its saved request. */
  async function retry() {
    if (last.current) return submit(last.current.request, last.current.label);
    if (!jobId) return;
    const id = await retryFromList(jobId);
    if (id) {
      setJobId(id);
      window.history.replaceState(null, "", jobHref({ id, screen }));
    }
  }

  return { jobId, view, running, busy: running || submitting, error, submit, retry, cancel, cancelling };
}
