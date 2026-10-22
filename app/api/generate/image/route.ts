import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { generateImageSchema } from "@/lib/validation/generate";
import { runGeneration } from "@/lib/generation";

// Slika traje 40–75 s po pokušaju; 2 pokušaja + rezervni.
export const maxDuration = 300;

// POST /api/generate/image — 8 tokena
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser();
  const input = await readJson(req, generateImageSchema);
  const generation = await runGeneration(user, {
    type: "image_from_prompt",
    prompt: input.prompt,
    aspectRatio: input.aspect_ratio,
    idempotencyKey: input.idempotency_key,
  });
  return ok({ generation });
});
