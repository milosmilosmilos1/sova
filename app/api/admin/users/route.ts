import type { NextRequest } from "next/server";
import { withApi, ok, readQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminUsersQuerySchema } from "@/lib/validation/admin";
import { AppError } from "@/lib/errors";

// GET /api/admin/users?q=&status=&cursor=&limit=
export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();
  const q = readQuery(req, adminUsersQuerySchema);
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select("id, email, full_name, role, token_balance, is_blocked, onboarding_completed, created_at")
    .order("created_at", { ascending: false })
    .limit(q.limit + 1);

  if (q.q) {
    const term = q.q.replace(/[%_,]/g, " ").trim();
    if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }
  if (q.status === "blocked") query = query.eq("is_blocked", true);
  if (q.status === "admins") query = query.eq("role", "admin");
  if (q.cursor) query = query.lt("created_at", q.cursor);

  // Pretplaćeni / besplatni: filter po skupu user_id iz subscriptions.
  if (q.status === "subscribed" || q.status === "free") {
    const { data: subs } = await admin.from("subscriptions").select("user_id").in("status", ["active", "trialing", "past_due"]);
    const ids = [...new Set((subs ?? []).map((s) => s.user_id))];
    if (q.status === "subscribed") {
      if (ids.length === 0) return ok({ items: [], nextCursor: null });
      query = query.in("id", ids);
    } else if (ids.length > 0) {
      query = query.not("id", "in", `(${ids.join(",")})`);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/users]", error.message);
    throw new AppError("INTERNAL");
  }
  const rows = data ?? [];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  // Aktivna pretplata po korisniku (jedan upit).
  const { data: subs } = await admin
    .from("subscriptions")
    .select("user_id, plan, status")
    .in("user_id", page.map((p) => p.id))
    .in("status", ["active", "trialing", "past_due"]);
  const subMap = new Map((subs ?? []).map((s) => [s.user_id, s]));

  return ok({
    items: page.map((p) => ({ ...p, subscription: subMap.get(p.id) ?? null })),
    nextCursor: hasMore ? page[page.length - 1].created_at : null,
  });
});
