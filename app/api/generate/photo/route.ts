import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { generatePhotoSchema } from "@/lib/validation/generate";
import { runGeneration } from "@/lib/generation";

export const maxDuration = 300;

// POST /api/generate/photo — slika iz fotografije, 8 tokena
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser();
  const input = await readJson(req, generatePhotoSchema);
  const generation = await runGeneration(user, {
    type: "image_from_photo",
    prompt: input.prompt,
    aspectRatio: input.aspect_ratio,
    inputImagePath: input.input_image_path,
    idempotencyKey: input.idempotency_key,
  });
  return ok({ generation });
});
