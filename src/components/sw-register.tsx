"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only (in dev it would fight with hot reload). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[pwa] service worker registration failed", err);
    });
  }, []);
  return null;
}
