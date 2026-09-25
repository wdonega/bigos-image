"use client";

import { useEffect, useState } from "react";
import { type JobView, TERMINAL } from "@/lib/client/api";

/** Follows a job through Server-Sent Events until it is done, failed or cancelled. */
export function useJob(jobId: string | null): JobView | null {
  const [state, setState] = useState<{ jobId: string; view: JobView } | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (event) => {
      const view = JSON.parse(event.data) as JobView;
      setState({ jobId, view });
      if (TERMINAL.has(view.status)) source.close();
    };
    return () => source.close();
  }, [jobId]);

  return state && state.jobId === jobId ? state.view : null;
}
