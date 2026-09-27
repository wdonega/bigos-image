// MP3 helpers for music results (spec §14, decision 30). No ffmpeg in the image: the duration is
// read straight from the MPEG audio frame headers.

// Bitrates (kbps) for Layer III, by [MPEG-1 | MPEG-2/2.5][index].
const BITRATES = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/** Duration in seconds of an MP3 (Layer III) buffer, counting its frames; 0 when none is found. */
export function mp3Duration(data: Uint8Array): number {
  let offset = 0;
  // Skip an ID3v2 tag ("ID3" + version + flags + 4-byte syncsafe size).
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33 && data.length >= 10) {
    offset = 10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]);
  }
  let samples = 0;
  let rate = 0;
  while (offset + 4 <= data.length) {
    const b1 = data[offset + 1];
    const b2 = data[offset + 2];
    const version = (b1 >> 3) & 0b11;
    const layer = (b1 >> 1) & 0b11;
    const bitrateIndex = b2 >> 4;
    const rateIndex = (b2 >> 2) & 0b11;
    const valid =
      data[offset] === 0xff &&
      (b1 & 0xe0) === 0xe0 &&
      version !== 1 &&
      layer === 1 &&
      bitrateIndex > 0 &&
      bitrateIndex < 15 &&
      rateIndex < 3;
    if (!valid) {
      offset++;
      continue;
    }
    const mpeg1 = version === 3;
    const sampleRate = SAMPLE_RATES[version][rateIndex];
    const bitrate = BITRATES[mpeg1 ? 0 : 1][bitrateIndex] * 1000;
    const padding = (b2 >> 1) & 1;
    const frameLength = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
    samples += mpeg1 ? 1152 : 576;
    rate = sampleRate;
    offset += frameLength;
  }
  return rate ? samples / rate : 0;
}
