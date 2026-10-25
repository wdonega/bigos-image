import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { PREVIEW_CHOICES, type PreviewChoice, previewFile, previewTape, readTapeMeta } from "@/lib/tapes";

const bodySchema = z.object({ seconds: z.number().min(0) });

// Color previews of one frame (spec §14, decision 32): POST makes them at a point of the video and
// returns their URLs; GET serves one.
export async function POST(request: Request, ctx: RouteContext<"/api/restore/uploads/[id]/preview">) {
  try {
    const config = getConfig();
    const meta = await readTapeMeta(config, (await ctx.params).id);
    if (!meta) throw new AppError("upload_not_found", 404);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("invalid_request", 400);
    const ms = await previewTape(config, meta, parsed.data.seconds);
    const base = `/api/restore/uploads/${meta.id}/preview?ms=${ms}&choice=`;
    return Response.json({ ms, images: Object.fromEntries(PREVIEW_CHOICES.map((c) => [c, `${base}${c}`])) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/restore/uploads/[id]/preview">) {
  try {
    const config = getConfig();
    const meta = await readTapeMeta(config, (await ctx.params).id);
    const params = new URL(request.url).searchParams;
    const ms = Number(params.get("ms"));
    const choice = params.get("choice") as PreviewChoice;
    if (!meta || !Number.isInteger(ms) || !PREVIEW_CHOICES.includes(choice)) throw new AppError("upload_not_found", 404);
    const jpeg = await readFile(previewFile(config, meta.id, ms, choice)).catch(() => null);
    if (!jpeg) throw new AppError("upload_not_found", 404);
    return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
  } catch (err) {
    return errorResponse(err);
  }
}
