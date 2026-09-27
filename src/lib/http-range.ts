// HTTP Range for video playback: Safari/iOS only plays <video> from servers that answer byte
// ranges with 206, and the MP4s from VHS_VideoCombine keep their index at the end of the file.

export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range `Range: bytes=…` header for a file of `size` bytes.
 * null = no (usable) Range header, serve the whole file; "unsatisfiable" = answer 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
