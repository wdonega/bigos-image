import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { saveUpload } from "@/lib/uploads";

// Stores one image (field "file") and returns its id and the size ComfyUI will receive.
export async function POST(request: Request) {
  try {
    const config = getConfig();
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("invalid_image", 400);
    if (file.size > config.maxUploadBytes) {
      throw new AppError("image_too_large", 413, [
        `O limite é ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB por imagem.`,
      ]);
    }
    const meta = await saveUpload(config, Buffer.from(await file.arrayBuffer()));
    return Response.json(meta, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
