import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { withApi, ok, clientIp, userAgent } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createImpersonationToken, isImpersonationConfigured, IMPERSONATION_COOKIE } from "@/lib/auth/impersonation";
import { idParamSchema } from "@/lib/validation/generate";
import { AppError } from "@/lib/errors";

// POST /api/admin/users/[id]/impersonate → postavlja potpisan cookie, upisuje audit.
export const POST = withApi(async (req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]/impersonate">) => {
  const me = await requireAdmin();
  if (!isImpersonationConfigured()) throw new AppError("NOT_CONFIGURED", "IMPERSONATION_SECRET nije podešen.");
  const id = idParamSchema.parse((await ctx.params).id);
  if (id === me.id) throw new AppError("VALIDATION_ERROR", "Ne možeš da gledaš kao sam sebe.");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, email").eq("id", id).maybeSingle();
  if (!target) throw new AppError("NOT_FOUND", "Korisnik ne postoji.");

  const { token, maxAge } = createImpersonationToken(me.id, target.id);
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  await admin.rpc("log_admin_action", {
    p_admin_id: me.id,
    p_action: "impersonate_start",
    p_target_id: target.id,
    p_details: { email: target.email },
    p_ip: clientIp(req),
    p_user_agent: userAgent(req),
  });

  return ok({ redirect: "/dashboard", email: target.email });
});
