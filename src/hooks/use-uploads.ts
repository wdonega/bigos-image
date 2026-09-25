"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type UploadedImage, uploadImage } from "@/lib/client/api";

export type UploadItem = {
  key: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  upload?: UploadedImage;
  error?: string;
};

export const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

/**
 * Ordered list of images uploaded as soon as they are chosen. `onReorder` receives, for each new
 * position, the old 1-based number (used to renumber "[Imagem N]" mentions in the prompt).
 */
export function useUploads(max: number, onReorder?: (order: number[]) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  const patch = (key: string, change: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));

  /** Adds files up to the limit; returns how many were left out. */
  function add(files: File[]): number {
    const room = Math.max(max - items.length, 0);
    const accepted = files.slice(0, room);
    const added = accepted.map((file) => ({
      file,
      item: {
        key: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        status: "uploading" as const,
      },
    }));
    setItems((prev) => [...prev, ...added.map((a) => a.item)]);
    for (const { file, item } of added) {
      uploadImage(file)
        .then((upload) => patch(item.key, { status: "ready", upload }))
        .catch((err: unknown) =>
          patch(item.key, {
            status: "error",
            error: err instanceof ApiError ? err.code : "upload_failed",
          }),
        );
    }
    return files.length - accepted.length;
  }

  function reorder(next: UploadItem[]) {
    onReorder?.(next.map((i) => items.indexOf(i) + 1));
    setItems(next);
  }

  function remove(key: string) {
    const item = items.find((i) => i.key === key);
    if (item) URL.revokeObjectURL(item.previewUrl);
    reorder(items.filter((i) => i.key !== key));
  }

  function move(key: string, delta: -1 | 1) {
    const from = items.findIndex((i) => i.key === key);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    reorder(next);
  }

  function clear() {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
  }

  const ready = items.every((i) => i.status === "ready");
  const ids = items.flatMap((i) => (i.upload ? [i.upload.id] : []));
  return { items, add, remove, move, clear, ready, ids };
}
