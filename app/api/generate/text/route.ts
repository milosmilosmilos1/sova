import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { generateTextSchema } from "@/lib/validation/generate";
import { runGeneration } from "@/lib/generation";

export const maxDuration = 120;

// POST /api/generate/text — 2 tokena
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser();
  const input = await readJson(req, generateTextSchema);
  const generation = await runGeneration(user, {
    type: "text",
    prompt: input.prompt,
    platform: input.platform,
    tone: input.tone,
    inputImagePath: input.input_image_path,
    fromGenerationId: input.from_generation_id,
    idempotencyKey: input.idempotency_key,
  });
  return ok({ generation });
});
