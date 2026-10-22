import type { NextRequest } from "next/server";
import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { idParamSchema } from "@/lib/validation/generate";
import { AppError } from "@/lib/errors";
import { removeObject } from "@/lib/storage";
import { toDTO } from "@/lib/generation";

type Ctx = RouteContext<"/api/generations/[id]">;

// GET /api/generations/[id]
export const GET = withApi(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  const id = idParamSchema.parse((await ctx.params).id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("generations").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("[generations] get", error.message);
    throw new AppError("INTERNAL");
  }
  if (!data) throw new AppError("NOT_FOUND", "Ova generacija ne postoji.");
  return ok({ generation: await toDTO(data) });
});

// DELETE /api/generations/[id] — briše red i fajlove iz storage-a.
export const DELETE = withApi(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  const id = idParamSchema.parse((await ctx.params).id);
  const supabase = await createClient();

  const { data } = await supabase
    .from("generations")
    .select("id, status, input_image_path, output_image_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Ova generacija ne postoji.");
  if (data.status === "pending" || data.status === "processing") {
    throw new AppError("CONFLICT", "Generisanje je još u toku, sačekaj da se završi.");
  }

  const { error } = await supabase.from("generations").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[generations] delete", error.message);
    throw new AppError("INTERNAL");
  }

  await Promise.all([removeObject("generated", data.output_image_path), removeObject("uploads", data.input_image_path)]);
  return ok({ deleted: true });
});
