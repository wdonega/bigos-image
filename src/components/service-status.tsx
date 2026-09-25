"use client";

import { CloudOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/provider";

type Health = { comfy: boolean; queue: boolean };

/** Warns up front when the generator or the queue is down, before the user fills the form. */
export function ServiceStatus() {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then((h) => active && setHealth(h))
      .catch(() => active && setHealth({ comfy: false, queue: false }));
    return () => {
      active = false;
    };
  }, []);

  if (!health || (health.comfy && health.queue)) return null;
  return (
    <Alert variant="destructive">
      <CloudOffIcon aria-hidden />
      <AlertTitle>{t(health.comfy ? "errors.queue_unavailable" : "errors.comfy_unavailable")}</AlertTitle>
      <AlertDescription>{t("service.retryHint")}</AlertDescription>
    </Alert>
  );
}
