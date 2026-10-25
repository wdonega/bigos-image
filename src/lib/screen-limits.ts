import { getConfig } from "./config.ts";
import type { SizeLimits } from "./size.ts";

export type ScreenLimits = SizeLimits & {
  maxRefs: number;
  maxUploadBytes: number;
  canEnhance: boolean;
  maxVideoRefs: number;
  /** Video effects (spec §14, decision 31). */
  maxVideoUploadBytes: number;
  effectMaxSeconds: number;
  /** Old video restoration (spec §14, decision 32). */
  restore: {
    maxUploadBytes: number;
    maxSeconds: { upscale: number; clean: number };
    factors: { upscale: number; clean: number };
    warnMinutes: number[];
  };
};

/** The subset of server config the screens need (sent to the browser; no secrets). */
export function screenLimits(): ScreenLimits {
  const c = getConfig();
  return {
    maxPixels: c.maxPixels,
    minSide: c.minSide,
    maxAspectRatio: c.maxAspectRatio,
    maxRefs: c.maxRefs,
    maxUploadBytes: c.maxUploadBytes,
    canEnhance: c.llm !== null,
    maxVideoRefs: c.video.maxRefs,
    maxVideoUploadBytes: c.effects.maxUploadBytes,
    effectMaxSeconds: c.effects.maxSeconds,
    restore: {
      maxUploadBytes: c.restore.maxUploadBytes,
      maxSeconds: c.restore.maxSeconds,
      factors: c.restore.factors,
      warnMinutes: c.restore.warnMinutes,
    },
  };
}
