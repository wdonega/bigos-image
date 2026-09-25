import { getConfig } from "./config.ts";
import type { SizeLimits } from "./size.ts";

export type ScreenLimits = SizeLimits & { maxRefs: number; maxUploadBytes: number };

/** The subset of server config the screens need (sent to the browser; no secrets). */
export function screenLimits(): ScreenLimits {
  const c = getConfig();
  return {
    maxPixels: c.maxPixels,
    minSide: c.minSide,
    maxAspectRatio: c.maxAspectRatio,
    maxRefs: c.maxRefs,
    maxUploadBytes: c.maxUploadBytes,
  };
}
