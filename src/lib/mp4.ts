// MP4/MOV header reader for uploaded videos (spec §14, decision 31). No ffmpeg in the image: the
// duration, size, rotation and tracks come straight from the ISO-BMFF boxes (moov → mvhd, trak →
// tkhd + mdia/hdlr). Both MP4 and QuickTime MOV (what phones record) use this layout.

export type VideoInfo = {
  /** Movie duration in seconds. */
  seconds: number;
  /** Displayed size: tkhd size with a 90°/270° rotation already applied. */
  width: number;
  height: number;
  /** Clockwise rotation from the track matrix: 0, 90, 180 or 270. */
  rotation: number;
  hasVideo: boolean;
  hasAudio: boolean;
};

type Box = { type: string; start: number; end: number };

function* boxes(data: Uint8Array, view: DataView, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

const child = (data: Uint8Array, view: DataView, box: Box, type: string) => {
  for (const b of boxes(data, view, box.start, box.end)) if (b.type === type) return b;
  return null;
};

/** True when the buffer starts like an ISO-BMFF file (an `ftyp` box first). */
export function isMp4(data: Uint8Array): boolean {
  return data.length >= 12 && String.fromCharCode(...data.subarray(4, 8)) === "ftyp";
}

/** Reads the header of an MP4/MOV; null when it is not one or has no readable movie box. */
export function readVideoInfo(data: Uint8Array): VideoInfo | null {
  if (!isMp4(data)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let moov: Box | null = null;
  for (const b of boxes(data, view, 0, data.length)) if (b.type === "moov") moov = b;
  if (!moov) return null;

  const mvhd = child(data, view, moov, "mvhd");
  if (!mvhd) return null;
  const v1 = data[mvhd.start] === 1;
  const timescale = view.getUint32(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16);
  if (!timescale) return null;

  const info: VideoInfo = { seconds: duration / timescale, width: 0, height: 0, rotation: 0, hasVideo: false, hasAudio: false };
  for (const trak of boxes(data, view, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(data, view, trak, "mdia");
    const hdlr = mdia && child(data, view, mdia, "hdlr");
    const handler = hdlr ? String.fromCharCode(...data.subarray(hdlr.start + 8, hdlr.start + 12)) : "";
    if (handler === "soun") info.hasAudio = true;
    if (handler !== "vide" || info.hasVideo) continue;
    const tkhd = child(data, view, trak, "tkhd");
    if (!tkhd) continue;
    // Matrix (9 × 32-bit, a b u / c d v / x y w) after the fixed fields; then width and height (16.16).
    const matrix = tkhd.start + (data[tkhd.start] === 1 ? 52 : 40);
    const a = view.getInt32(matrix) / 65536;
    const b = view.getInt32(matrix + 4) / 65536;
    const rotation = (Math.round((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
    const width = view.getUint32(matrix + 36) >>> 16;
    const height = view.getUint32(matrix + 40) >>> 16;
    const sideways = rotation === 90 || rotation === 270;
    Object.assign(info, {
      hasVideo: true,
      rotation,
      width: sideways ? height : width,
      height: sideways ? width : height,
    });
  }
  return info;
}
