"use client";

import { useRef, useState } from "react";
import { useJob } from "@/hooks/use-job";
import { ApiError, TERMINAL, cancelJob, createJob } from "@/lib/client/api";

/** Submits a job, follows it and cancels it; shared by the Generate and Edit screens. */
export function useJobRunner() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const lastRequest = useRef<unknown>(null);
  const view = useJob(jobId);
  const running = jobId !== null && (view === null || !TERMINAL.has(view.status));

  async function submit(request: unknown) {
    lastRequest.current = request;
    setSubmitting(true);
    setError(null);
    try {
      setJobId(await createJob(request));
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

  /** Sends the last request again ("Try again" after a failure). */
  function retry() {
    if (lastRequest.current !== null) void submit(lastRequest.current);
  }

  return { jobId, view, running, busy: running || submitting, error, submit, retry, cancel, cancelling };
}
