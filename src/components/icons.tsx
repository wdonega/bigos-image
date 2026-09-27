import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

// App icons (24 px grid, stroke = text color) and the cat that tells the result panel's state.
// Actions use plain pictograms (image + sparkle, image + pencil); the cat appears only where it
// adds meaning: empty (asleep), connecting (one eye open), generating (watching the bar), error.

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Generate: an image with a sparkle. */
export function GenerateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="m3 16 4.5-4.5 3.5 3.5 2.5-2.5L19 18" />
      <path d="M18.5 1.8l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z" />
    </Icon>
  );
}

/** Edit: an image with a pencil. */
export function EditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="m3 16 4.5-4.5 3 3" />
      <path d="M19.6 3.4a2 2 0 0 1 0 2.8L13 12.8l-3.4.9.9-3.4 6.6-6.6a2 2 0 0 1 2.5-.3Z" />
    </Icon>
  );
}

/** Video: a camera with a sparkle. */
export function VideoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="7" width="13" height="11" rx="2" />
      <path d="m15.5 11 5-3v9l-5-3" />
      <path d="M8.5 2.2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z" />
    </Icon>
  );
}

/** Reference images: a photo with cat ears. */
export function ReferenceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9h18v11H3z" />
      <path d="M5.5 9 7.5 5l2 4M14.5 9l2-4 2 4" />
      <path d="m3 17 4.5-4 3.5 3 3-2.5L21 18" />
    </Icon>
  );
}

/** Style: a palette whose paint blobs are toe beans. */
export function StyleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-.8 1.7-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3Z" />
      <circle cx="7.5" cy="12" r="1.2" />
      <circle cx="9" cy="7.8" r="1.2" />
      <circle cx="13.5" cy="7" r="1.2" />
    </Icon>
  );
}

/** Transparent background: a cat head drawn with a dashed line (no fill, no background). */
export function TransparentIcon(props: IconProps) {
  return (
    <Icon strokeDasharray="2.2 2.4" {...props}>
      <path d="M5 13V6l3.5 2.6a7 7 0 0 1 7 0L19 6v7a7 7 0 0 1-14 0Z" />
    </Icon>
  );
}

// The cat (120 × 90). Shared parts: body, paws, whiskers, nose.
function CatBody({ tailClassName, tail = "M86 84c8 0 12-5 9-11" }: { tailClassName?: string; tail?: string }) {
  return (
    <>
      <path d="M30 84c0-11 5-18 12-21M68 63c11 3 18 11 18 21M22 84h66" />
      <path className={tailClassName} d={tail} />
      <path d="M47 84v-4a3 3 0 0 1 6 0v4M57 84v-4a3 3 0 0 1 6 0v4" />
      <path d="M40 60l-9 1M40 63l-8 3M70 60l9 1M70 63l8 3" />
      <path d="M53.6 58h2.8L55 59.6Z" />
    </>
  );
}

const HEAD = "M38 54V33l9 7.5a19 19 0 0 1 16 0L72 33v21a17 17 0 0 1-34 0Z";

function Cat({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-auto w-40 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Empty result panel: asleep, with a slow "zzz". */
export function CatSleeping({ className }: { className?: string }) {
  return (
    <Cat className={className}>
      <path d={HEAD} />
      <path d="M45 53q3 2.5 6 0M59 53q3 2.5 6 0" />
      <CatBody />
      <path className="cat-zzz text-primary" stroke="currentColor" d="M80 26h7l-7 8h7M92 14h5l-5 6h5" />
    </Cat>
  );
}

/** Waiting for the generator machine to wake up: one eye open, blinking. */
export function CatWaking({ className }: { className?: string }) {
  return (
    <Cat className={className}>
      <path d={HEAD} />
      <path d="M45 53q3 2.5 6 0" />
      <circle className="cat-blink text-primary" cx="62" cy="52" r="2.4" fill="currentColor" stroke="none" />
      <CatBody />
    </Cat>
  );
}

/**
 * Generating: eyes follow the progress bar (0–1; null = not started yet, the eyes look around)
 * and the tail swings.
 */
export function CatWatching({ progress, className }: { progress: number | null; className?: string }) {
  const pupil = progress === null ? undefined : { transform: `translateX(${(progress * 6 - 3).toFixed(2)}px)` };
  const pupilClass = cn("text-primary", progress === null ? "cat-look" : "cat-follow");
  return (
    <Cat className={className}>
      <path d={HEAD} />
      <circle cx="48" cy="51" r="4.2" />
      <circle cx="62" cy="51" r="4.2" />
      <circle className={pupilClass} style={pupil} cx="48" cy="51.5" r="2" fill="currentColor" stroke="none" />
      <circle className={pupilClass} style={pupil} cx="62" cy="51.5" r="2" fill="currentColor" stroke="none" />
      <CatBody tailClassName="cat-tail" />
    </Cat>
  );
}

/** Error: ears down, worried brows. */
export function CatSad({ className }: { className?: string }) {
  return (
    <Cat className={className}>
      <path d="M38 54l-6-9 12 1.5a19 19 0 0 1 22 0l12-1.5-6 9a17 17 0 0 1-34 0Z" />
      <circle cx="48" cy="53" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="62" cy="53" r="1.8" fill="currentColor" stroke="none" />
      <path d="M44 48.5l5 1.5M66 48.5l-5 1.5" />
      <path d="M51 64.5q4-3 8 0" />
      <CatBody tail="M86 84c6-2 10-10 6-18" />
    </Cat>
  );
}
