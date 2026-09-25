// Single source of truth for the PWA/app icons and iOS launch screens: read by the generator
// (scripts/generate-icons.ts), the manifest, the root layout metadata and pwa-assets.test.ts.

export const THEME_COLOR = "#ffc87c";

/** Android/Chrome launcher and manifest icons ("any" purpose). */
export const ICON_SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512] as const;
/** Android adaptive icons: art kept inside the 80% safe zone. */
export const MASKABLE_SIZES = [192, 512] as const;
/** iOS home screen icons: iPhone (120, 180) and iPad (152, 167). */
export const APPLE_ICON_SIZES = [120, 152, 167, 180] as const;
/** PNG favicons next to favicon.ico (16/32/48). */
export const FAVICON_SIZES = [16, 32] as const;

export const iconPath = (size: number) => `/icons/icon-${size}.png`;
export const maskableIconPath = (size: number) => `/icons/icon-maskable-${size}.png`;
export const appleIconPath = (size: number) => `/icons/apple-touch-icon-${size}.png`;
export const faviconPath = (size: number) => `/icons/favicon-${size}.png`;

/** A device's portrait viewport in CSS pixels and its device pixel ratio. */
export type Device = { name: string; width: number; height: number; ratio: number };

/**
 * iOS shows `apple-touch-startup-image` only when the media query matches the device exactly;
 * without one the installed app opens on a blank screen. Portrait only (manifest orientation).
 */
export const STARTUP_DEVICES: Device[] = [
  { name: "iPhone 16 Pro Max", width: 440, height: 956, ratio: 3 },
  { name: "iPhone 16 Pro", width: 402, height: 874, ratio: 3 },
  { name: "iPhone 16 Plus / 15 Pro Max / 15 Plus / 14 Pro Max", width: 430, height: 932, ratio: 3 },
  { name: "iPhone 16 / 15 / 15 Pro / 14 Pro", width: 393, height: 852, ratio: 3 },
  { name: "iPhone 14 Plus / 13 Pro Max / 12 Pro Max", width: 428, height: 926, ratio: 3 },
  { name: "iPhone 14 / 13 / 13 Pro / 12 / 12 Pro", width: 390, height: 844, ratio: 3 },
  { name: "iPhone 13 mini / 12 mini / 11 Pro / XS / X", width: 375, height: 812, ratio: 3 },
  { name: "iPhone 11 Pro Max / XS Max", width: 414, height: 896, ratio: 3 },
  { name: "iPhone 11 / XR", width: 414, height: 896, ratio: 2 },
  { name: "iPhone 8 Plus / 7 Plus", width: 414, height: 736, ratio: 3 },
  { name: "iPhone SE (2nd/3rd) / 8 / 7", width: 375, height: 667, ratio: 2 },
  { name: "iPhone SE (1st)", width: 320, height: 568, ratio: 2 },
  { name: "iPad Pro 13\" (M4)", width: 1032, height: 1376, ratio: 2 },
  { name: "iPad Pro 12.9\"", width: 1024, height: 1366, ratio: 2 },
  { name: "iPad Pro 11\" (M4)", width: 834, height: 1210, ratio: 2 },
  { name: "iPad Pro 11\" / Air 11\"", width: 834, height: 1194, ratio: 2 },
  { name: "iPad Air 10.9\" / iPad 10.9\"", width: 820, height: 1180, ratio: 2 },
  { name: "iPad 10.2\"", width: 810, height: 1080, ratio: 2 },
  { name: "iPad mini 8.3\"", width: 744, height: 1133, ratio: 2 },
];

export const startupPixels = (d: Device) => ({ width: d.width * d.ratio, height: d.height * d.ratio });

export function startupImagePath(d: Device): string {
  const { width, height } = startupPixels(d);
  return `/splash/splash-${width}x${height}.png`;
}

export function startupMedia(d: Device): string {
  return `(device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: portrait)`;
}
