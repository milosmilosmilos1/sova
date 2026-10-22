import type { NextRequest } from "next/server";
import { withApi, ok, clientIp, userAgent } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { idParamSchema } from "@/lib/validation/generate";
import { removeObject } from "@/lib/storage";
import { AppError } from "@/lib/errors";

// DELETE /api/admin/generations/[id]: admin briše bilo čiju generaciju (npr. sporan sadržaj).
export const DELETE = withApi(async (req: NextRequest, ctx: RouteContext<"/api/admin/generations/[id]">) => {
  const me = await requireAdmin();
  const id = idParamSchema.parse((await ctx.params).id);
  const admin = createAdminClient();

  const { data } = await admin.from("generations").select("id, user_id, input_image_path, output_image_path, prompt").eq("id", id).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Generacija ne postoji.");

  const { error } = await admin.from("generations").delete().eq("id", id);
  if (error) {
    console.error("[admin/generations] delete", error.message);
    throw new AppError("INTERNAL");
  }
  await Promise.all([removeObject("generated", data.output_image_path), removeObject("uploads", data.input_image_path)]);
  await admin.rpc("log_admin_action", {
    p_admin_id: me.id,
    p_action: "generation_delete",
    p_target_id: data.user_id,
    p_details: { generation_id: id, prompt: data.prompt.slice(0, 200) },
    p_ip: clientIp(req),
    p_user_agent: userAgent(req),
  });
  return ok({ deleted: true });
});
