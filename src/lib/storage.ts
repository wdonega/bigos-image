import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.ts";

// Generated results and uploads live on disk under STORAGE_DIR and expire after RETENTION_HOURS.
const AREAS = ["results", "uploads"] as const;
type Area = (typeof AREAS)[number];

const SAFE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export function storageFile(config: Config, area: Area, name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error(`Unsafe storage file name: ${name}`);
  return path.resolve(config.storageDir, area, name);
}

export async function writeStored(config: Config, area: Area, name: string, data: Buffer) {
  const file = storageFile(config, area, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function readStored(config: Config, area: Area, name: string): Promise<Buffer | null> {
  try {
    return await readFile(storageFile(config, area, name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Deletes files older than the retention window; returns how many were removed. */
export async function removeExpired(config: Config, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const area of AREAS) {
    const dir = path.resolve(config.storageDir, area);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const file = path.join(dir, name);
      const info = await stat(file).catch(() => null);
      if (info?.isFile() && now - info.mtimeMs > config.retentionMs) {
        await rm(file, { force: true });
        removed++;
      }
    }
  }
  return removed;
}
