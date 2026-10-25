"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/client/api";

export type SingleItem<T> = {
  key: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  upload?: T;
  error?: string;
};

export const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,.mp4,.mov";

/**
 * One file uploaded as soon as it is chosen (the Effects screen's video and photo, spec §14
 * decision 31). Choosing another replaces it; a late reply for the old one is ignored.
 */
export function useSingleUpload<T extends { id: string }>(
  send: (file: File) => Promise<T>,
  limit: { maxBytes: number; tooLarge: string; failed: string },
) {
  const [item, setItem] = useState<SingleItem<T> | null>(null);
  const current = useRef<string | null>(null);
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);
  useEffect(
    () => () => {
      if (itemRef.current) URL.revokeObjectURL(itemRef.current.previewUrl);
    },
    [],
  );

  const patch = (key: string, change: Partial<SingleItem<T>>) => {
    if (current.current === key) setItem((prev) => (prev && prev.key === key ? { ...prev, ...change } : prev));
  };

  function choose(file: File) {
    if (item) URL.revokeObjectURL(item.previewUrl);
    const key = crypto.randomUUID();
    current.current = key;
    const next: SingleItem<T> = { key, name: file.name, previewUrl: URL.createObjectURL(file), status: "uploading" };
    if (file.size > limit.maxBytes) {
      setItem({ ...next, status: "error", error: limit.tooLarge });
      return;
    }
    setItem(next);
    send(file)
      .then((upload) => patch(key, { status: "ready", upload }))
      .catch((err: unknown) => patch(key, { status: "error", error: err instanceof ApiError ? err.code : limit.failed }));
  }

  function clear() {
    if (item) URL.revokeObjectURL(item.previewUrl);
    current.current = null;
    setItem(null);
  }

  return { item, choose, clear, ready: item?.status === "ready", id: item?.upload?.id ?? null };
}
