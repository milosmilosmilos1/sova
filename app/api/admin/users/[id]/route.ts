import type { NextRequest } from "next/server";
import { withApi, ok, readJson, clientIp, userAgent } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminUserPatchSchema } from "@/lib/validation/admin";
import { idParamSchema } from "@/lib/validation/generate";
import { AppError } from "@/lib/errors";
import type { Json } from "@/types/database";

type Ctx = RouteContext<"/api/admin/users/[id]">;

// GET /api/admin/users/[id]: profil, biznis, pretplata, poslednje generacije, ledger.
export const GET = withApi(async (_req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  const id = idParamSchema.parse((await ctx.params).id);
  const admin = createAdminClient();

  const [{ data: profile }, { data: business }, { data: subscriptions }, { data: generations }, { data: ledger }, { data: payments }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", id).maybeSingle(),
      admin.from("businesses").select("*").eq("user_id", id).maybeSingle(),
      admin.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }),
      admin
        .from("generations")
        .select("id, type, status, prompt, tokens_cost, model, error_code, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("token_transactions")
        .select("id, amount, balance_after, type, status, note, admin_id, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("payments").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    ]);
  if (!profile) throw new AppError("NOT_FOUND", "Korisnik ne postoji.");

  return ok({ profile, business, subscriptions: subscriptions ?? [], generations: generations ?? [], ledger: ledger ?? [], payments: payments ?? [] });
});

// PATCH /api/admin/users/[id]: is_blocked, role. Admin ne može sebe.
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const me = await requireAdmin();
  const id = idParamSchema.parse((await ctx.params).id);
  const input = await readJson(req, adminUserPatchSchema);
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("id, role, is_blocked, email").eq("id", id).maybeSingle();
  if (!target) throw new AppError("NOT_FOUND", "Korisnik ne postoji.");

  if (id === me.id) {
    throw new AppError("VALIDATION_ERROR", "Ne možeš da menjaš sopstvenu rolu ili da blokiraš sebe.");
  }

  const patch: { is_blocked?: boolean; role?: "user" | "admin" } = {};
  const actions: Array<{ action: "user_block" | "user_unblock" | "role_change"; details: Json }> = [];

  if (input.is_blocked !== undefined && input.is_blocked !== target.is_blocked) {
    patch.is_blocked = input.is_blocked;
    actions.push({ action: input.is_blocked ? "user_block" : "user_unblock", details: { email: target.email } });
  }
  if (input.role !== undefined && input.role !== target.role) {
    if (target.role === "admin" && input.role === "user") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) throw new AppError("VALIDATION_ERROR", "Ovo je poslednji admin. Prvo postavi drugog.");
    }
    patch.role = input.role;
    actions.push({ action: "role_change", details: { email: target.email, from: target.role, to: input.role } });
  }

  if (Object.keys(patch).length === 0) return ok({ changed: false });

  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) {
    console.error("[admin/users] patch", error.message);
    throw new AppError("INTERNAL");
  }
  for (const a of actions) {
    await admin.rpc("log_admin_action", {
      p_admin_id: me.id,
      p_action: a.action,
      p_target_id: id,
      p_details: a.details,
      p_ip: clientIp(req),
      p_user_agent: userAgent(req),
    });
  }
  return ok({ changed: true });
});
