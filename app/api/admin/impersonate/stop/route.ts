import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { withApi, ok, clientIp, userAgent } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE } from "@/lib/auth/impersonation";
import { AppError } from "@/lib/errors";

// POST /api/admin/impersonate/stop → briše cookie, upisuje audit.
export const POST = withApi(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED");
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);

  if (user.isImpersonating && user.realAdmin) {
    const admin = createAdminClient();
    await admin.rpc("log_admin_action", {
      p_admin_id: user.realAdmin.id,
      p_action: "impersonate_stop",
      p_target_id: user.id,
      p_details: { email: user.email },
      p_ip: clientIp(req),
      p_user_agent: userAgent(req),
    });
  }
  return ok({ redirect: "/admin/users" });
});
