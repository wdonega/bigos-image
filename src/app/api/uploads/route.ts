import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { isMp4 } from "@/lib/mp4";
import { saveUpload, saveVideoUpload } from "@/lib/uploads";

// Stores one image (field "file") and returns its id and the size ComfyUI will receive. A video
// (MP4/MOV, spec §14 decision 31) goes the same way, with its first frame as an optional "frame".
export async function POST(request: Request) {
  try {
    const config = getConfig();
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("invalid_image", 400);
    const data = Buffer.from(await file.arrayBuffer());
    if (isMp4(data)) {
      if (file.size > config.effects.maxUploadBytes) {
        throw new AppError("video_too_large", 413, [
          { code: "max_video_upload_mb", params: { max: Math.round(config.effects.maxUploadBytes / 1024 / 1024) } },
        ]);
      }
      const frame = form?.get("frame");
      const frameData = frame instanceof File && frame.size <= config.maxUploadBytes ? Buffer.from(await frame.arrayBuffer()) : null;
      return Response.json(await saveVideoUpload(config, data, frameData), { status: 201 });
    }
    if (file.size > config.maxUploadBytes) {
      throw new AppError("image_too_large", 413, [
        { code: "max_upload_mb", params: { max: Math.round(config.maxUploadBytes / 1024 / 1024) } },
      ]);
    }
    const meta = await saveUpload(config, data);
    return Response.json(meta, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
