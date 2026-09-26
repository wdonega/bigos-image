"use client";

import { CloudOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CatWaking } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/provider";

type Health = { comfy: boolean; queue: boolean };

/** Only show "Connecting…" when the check is slow (the machine is waking up), not on every load. */
const CONNECTING_AFTER_MS = 1_000;

/**
 * Warns up front when the generator or the queue is down, before the user fills the form. The
 * ComfyUI machine sleeps and wakes on LAN (~10 s; /api/health waits up to COMFY_WAKE_SECONDS), so
 * a slow check shows "Connecting…", not an error.
 */
export function ServiceStatus({ wakeSeconds }: { wakeSeconds: number }) {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => active && setSlow(true), CONNECTING_AFTER_MS);
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then((h) => active && setHealth(h))
      .catch(() => active && setHealth({ comfy: false, queue: false }));
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (!health) {
    if (!slow) return null;
    return (
      <div role="status" className="flex items-center gap-4 rounded-2xl border bg-card p-3 pr-4">
        <CatWaking className="w-16 text-muted-foreground" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t("service.connecting")}</p>
          <p className="text-sm text-muted-foreground">{t("service.connectingHint", { seconds: wakeSeconds })}</p>
        </div>
      </div>
    );
  }
  if (health.comfy && health.queue) return null;
  return (
    <Alert variant="destructive">
      <CloudOffIcon aria-hidden />
      <AlertTitle>{t(health.comfy ? "errors.queue_unavailable" : "errors.comfy_unavailable")}</AlertTitle>
      <AlertDescription>{t("service.retryHint")}</AlertDescription>
    </Alert>
  );
}
