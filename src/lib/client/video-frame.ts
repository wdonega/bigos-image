// First frame of a chosen video, captured in the browser (no ffmpeg on the server, spec §14
// decision 31). The worker's vision pass describes the scene from it.

/** Longest side of the captured frame: enough to describe a scene, small enough to upload. */
const FRAME_MAX_SIDE = 1280;
/** Browsers that can't decode a codec (e.g. HEVC) never fire the events: give up instead. */
const FRAME_TIMEOUT_MS = 8_000;

/** PNG of the frame at ~0.1 s, or null when the browser can't decode the video. */
export async function captureFirstFrame(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), FRAME_TIMEOUT_MS);
      video.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
      video.addEventListener("error", () => (clearTimeout(timer), reject(new Error("decode error"))), { once: true });
    });
  try {
    const loaded = once("loadeddata");
    video.src = url;
    await loaded;
    // The very first frame is often black (fade-in); a tenth of a second in is safer.
    const seeked = once("seeked");
    video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
    await seeked;
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
