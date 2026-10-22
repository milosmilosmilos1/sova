import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

// GET /api/stats — poziva get_user_stats u bazi.
export const GET = withApi(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_stats", { p_user_id: user.id });
  if (error) {
    console.error("[stats]", error.message);
    throw new AppError("INTERNAL");
  }
  return ok({ stats: data });
});
