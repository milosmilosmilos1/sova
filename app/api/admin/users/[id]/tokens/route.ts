import type { NextRequest } from "next/server";
import { withApi, ok, readJson, clientIp, userAgent } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminTokensSchema } from "@/lib/validation/admin";
import { idParamSchema } from "@/lib/validation/generate";
import { AppError } from "@/lib/errors";

// POST /api/admin/users/[id]/tokens { amount, note } → novo stanje.
// Funkcija u bazi piše ledger i audit u istoj transakciji.
export const POST = withApi(async (req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]/tokens">) => {
  const me = await requireAdmin();
  const id = idParamSchema.parse((await ctx.params).id);
  const input = await readJson(req, adminTokensSchema);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("admin_adjust_tokens", {
    p_admin_id: me.id,
    p_target_id: id,
    p_amount: input.amount,
    p_note: input.note,
    p_ip: clientIp(req),
    p_user_agent: userAgent(req),
  });
  if (error) {
    if (error.message.includes("INSUFFICIENT_TOKENS")) throw new AppError("VALIDATION_ERROR", "Korisnik nema toliko tokena da se oduzme.");
    if (error.message.includes("USER_NOT_FOUND")) throw new AppError("NOT_FOUND", "Korisnik ne postoji.");
    if (error.message.includes("FORBIDDEN")) throw new AppError("FORBIDDEN");
    console.error("[admin/tokens]", error.message);
    throw new AppError("INTERNAL");
  }
  return ok({ balance: data as number });
});
