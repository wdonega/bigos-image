"use client";

import { useState } from "react";
import { useJob } from "@/hooks/use-job";
import { ApiError, TERMINAL, cancelJob, createJob } from "@/lib/client/api";

/** Submits a job, follows it and cancels it; shared by the Generate and Edit screens. */
export function useJobRunner() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const view = useJob(jobId);
  const running = jobId !== null && (view === null || !TERMINAL.has(view.status));

  async function submit(request: unknown) {
    setSubmitting(true);
    setError(null);
    try {
      setJobId(await createJob(request));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("unexpected", "Algo deu errado. Tente de novo."));
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

  return { jobId, view, running, busy: running || submitting, error, submit, cancel, cancelling };
}
