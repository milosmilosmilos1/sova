import type { NextRequest } from "next/server";
import { withApi, ok, readQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminAuditQuerySchema } from "@/lib/validation/admin";
import { AppError } from "@/lib/errors";

// GET /api/admin/audit?admin=&action=&cursor=&limit= (kursor je id, opadajuće)
export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();
  const q = readQuery(req, adminAuditQuerySchema);
  const admin = createAdminClient();

  let query = admin
    .from("admin_audit_log")
    .select("id, admin_id, action, target_user_id, details, ip, created_at")
    .order("id", { ascending: false })
    .limit(q.limit + 1);
  if (q.admin) query = query.eq("admin_id", q.admin);
  if (q.action) query = query.eq("action", q.action);
  if (q.cursor) query = query.lt("id", q.cursor);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/audit]", error.message);
    throw new AppError("INTERNAL");
  }
  const rows = data ?? [];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  const ids = [...new Set(page.flatMap((r) => [r.admin_id, r.target_user_id]).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return ok({
    items: page.map((r) => ({
      ...r,
      admin_email: emails.get(r.admin_id) ?? null,
      target_email: r.target_user_id ? (emails.get(r.target_user_id) ?? null) : null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});
