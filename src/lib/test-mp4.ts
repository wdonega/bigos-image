// ISO-BMFF fixtures for unit tests: just the boxes readVideoInfo looks at.
export function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const size = 8 + payload.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  let offset = 8;
  for (const p of payload) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function bytes(length: number, write: (view: DataView) => void): Uint8Array {
  const out = new Uint8Array(length);
  write(new DataView(out.buffer));
  return out;
}

export const ftyp = box("ftyp", new TextEncoder().encode("isom\0\0\0\0isom"));

export function mvhd(timescale: number, duration: number, version = 0): Uint8Array {
  return version === 1
    ? box("mvhd", bytes(108, (v) => {
        v.setUint8(0, 1);
        v.setUint32(20, timescale);
        v.setBigUint64(24, BigInt(duration));
      }))
    : box("mvhd", bytes(96, (v) => {
        v.setUint32(12, timescale);
        v.setUint32(16, duration);
      }));
}

/** Track header (v0): rotation matrix at byte 40, then width and height in 16.16 at 76 and 80. */
function tkhd(width: number, height: number, rotation = 0): Uint8Array {
  const [a, b] = ({ 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] } as Record<number, number[]>)[rotation];
  return box("tkhd", bytes(84, (v) => {
    v.setInt32(40, a * 65536);
    v.setInt32(44, b * 65536);
    v.setInt32(52, -b * 65536);
    v.setInt32(56, a * 65536);
    v.setUint32(76, width * 65536);
    v.setUint32(80, height * 65536);
  }));
}

function hdlr(handler: string): Uint8Array {
  return box("hdlr", bytes(24, (v) => [...handler].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)))));
}

export const videoTrak = (w: number, h: number, rotation = 0) => box("trak", tkhd(w, h, rotation), box("mdia", hdlr("vide")));
export const audioTrak = () => box("trak", tkhd(0, 0), box("mdia", hdlr("soun")));
export const file = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));

/** A whole MP4 (or MOV with brand "qt  ") with one video track and, optionally, audio. */
export function mp4(seconds: number, width: number, height: number, options: { audio?: boolean; rotation?: number; mov?: boolean } = {}): Buffer {
  const brand = options.mov ? box("ftyp", new TextEncoder().encode("qt  \0\0\0\0qt  ")) : ftyp;
  const tracks = [videoTrak(width, height, options.rotation ?? 0), ...(options.audio ? [audioTrak()] : [])];
  return Buffer.from(file(brand, box("mdat", new Uint8Array(64)), box("moov", mvhd(1000, Math.round(seconds * 1000)), ...tracks)));
}
