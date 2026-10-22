import { withApi, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

// GET /api/admin/stats
export const GET = withApi(async () => {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_admin_stats");
  if (error) {
    console.error("[admin/stats]", error.message);
    throw new AppError("INTERNAL");
  }
  return ok({ stats: data });
});
