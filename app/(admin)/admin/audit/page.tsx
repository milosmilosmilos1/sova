import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminAuditQuerySchema } from "@/lib/validation/admin";

const PAGE = 50;

export default async function AdminAuditPage(props: PageProps<"/admin/audit">) {
  const sp = await props.searchParams;
  const parsed = adminAuditQuerySchema.safeParse({ action: sp.action, admin: sp.admin, cursor: sp.cursor, limit: PAGE });
  const q = parsed.success ? parsed.data : { action: undefined, admin: undefined, cursor: undefined, limit: PAGE };
  const admin = createAdminClient();

  let query = admin.from("admin_audit_log").select("id, admin_id, action, target_user_id, details, ip, created_at").order("id", { ascending: false }).limit(PAGE + 1);
  if (q.action) query = query.eq("action", q.action);
  if (q.admin) query = query.eq("admin_id", q.admin);
  if (q.cursor) query = query.lt("id", q.cursor);
  const { data, error } = await query;
  const rows = data ?? [];
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;

  const ids = [...new Set(page.flatMap((r) => [r.admin_id, r.target_user_id]).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return (
    <div className="space-y-4">
      <h1 className="page-title">Audit log</h1>
      <form method="get" className="flex flex-wrap gap-2 text-sm">
        <select name="action" defaultValue={q.action ?? ""} className="input w-auto">
          <option value="">Sve akcije</option>
          {["tokens_adjust", "impersonate_start", "impersonate_stop", "user_block", "user_unblock", "role_change", "user_delete", "generation_delete"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm">
          Filtriraj
        </button>
      </form>
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Greška: {error.message}</p>
      ) : page.length === 0 ? (
        <p className="text-sm text-ink-500">Nema zapisa.</p>
      ) : (
        <div className="card card-pad overflow-x-auto"><table className="table">
          <thead>
            <tr>
              <th className="">Vreme</th>
              <th className="">Admin</th>
              <th className="">Akcija</th>
              <th className="">Korisnik</th>
              <th className="">Detalji</th>
              <th className="">IP</th>
            </tr>
          </thead>
          <tbody>
            {page.map((r) => (
              <tr key={r.id}>
                <td className="text-ink-500">{new Date(r.created_at).toLocaleString("sr-RS")}</td>
                <td className="">{emails.get(r.admin_id) ?? r.admin_id}</td>
                <td className="">{r.action}</td>
                <td className="">
                  {r.target_user_id ? (
                    <Link href={`/admin/users/${r.target_user_id}`} className="text-brand-700 hover:underline">
                      {emails.get(r.target_user_id) ?? "obrisan"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-md truncate font-mono text-xs text-ink-500">{JSON.stringify(r.details)}</td>
                <td className="text-ink-500">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {hasMore && (
        <Link href={`/admin/audit?${new URLSearchParams({ ...(q.action ? { action: q.action } : {}), cursor: String(page[page.length - 1].id) })}`} className="btn btn-secondary btn-sm">
          Sledeća strana
        </Link>
      )}
    </div>
  );
}
