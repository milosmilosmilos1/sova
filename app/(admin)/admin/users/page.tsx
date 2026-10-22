import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminUsersQuerySchema } from "@/lib/validation/admin";

const STATUS = [
  { key: "all", label: "Svi" },
  { key: "subscribed", label: "Pretplaćeni" },
  { key: "free", label: "Besplatni" },
  { key: "blocked", label: "Blokirani" },
  { key: "admins", label: "Admini" },
] as const;

const PAGE = 25;

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const sp = await props.searchParams;
  const parsed = adminUsersQuerySchema.safeParse({ q: sp.q, status: sp.status, cursor: sp.cursor, limit: PAGE });
  const q = parsed.success ? parsed.data : { q: undefined, status: "all" as const, cursor: undefined, limit: PAGE };
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select("id, email, full_name, role, token_balance, is_blocked, onboarding_completed, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE + 1);
  if (q.q) {
    const term = q.q.replace(/[%_,]/g, " ").trim();
    if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }
  if (q.status === "blocked") query = query.eq("is_blocked", true);
  if (q.status === "admins") query = query.eq("role", "admin");
  if (q.cursor) query = query.lt("created_at", q.cursor);

  let subIds: string[] | null = null;
  if (q.status === "subscribed" || q.status === "free") {
    const { data: subs } = await admin.from("subscriptions").select("user_id").in("status", ["active", "trialing", "past_due"]);
    subIds = [...new Set((subs ?? []).map((s) => s.user_id))];
    if (q.status === "subscribed") query = subIds.length ? query.in("id", subIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
    else if (subIds.length) query = query.not("id", "in", `(${subIds.join(",")})`);
  }

  const { data, error } = await query;
  const rows = data ?? [];
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  const { data: subs } = page.length
    ? await admin.from("subscriptions").select("user_id, plan, status").in("user_id", page.map((p) => p.id)).in("status", ["active", "trialing", "past_due"])
    : { data: [] };
  const subMap = new Map((subs ?? []).map((s) => [s.user_id, s]));

  const link = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q.q, status: q.status, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Korisnici</h1>
      <form method="get" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q.q ?? ""} placeholder="Mejl ili ime" className="input w-64" />
        <input type="hidden" name="status" value={q.status} />
        <button type="submit" className="btn btn-secondary btn-sm">
          Traži
        </button>
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        {STATUS.map((s) => (
          <Link key={s.key} href={link({ status: s.key, cursor: undefined })} className={`btn btn-sm ${q.status === s.key ? "btn-primary" : "btn-secondary"}`}>
            {s.label}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Greška: {error.message}</p>
      ) : page.length === 0 ? (
        <p className="text-sm text-ink-500">Nema korisnika za ovaj filter.</p>
      ) : (
        <div className="card card-pad overflow-x-auto"><table className="table">
          <thead>
            <tr>
              <th className="">Mejl</th>
              <th className="">Ime</th>
              <th className="">Rola</th>
              <th className="">Tokeni</th>
              <th className="">Plan</th>
              <th className="">Status</th>
              <th className="">Registrovan</th>
            </tr>
          </thead>
          <tbody>
            {page.map((p) => {
              const sub = subMap.get(p.id);
              return (
                <tr key={p.id}>
                  <td className="">
                    <Link href={`/admin/users/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.email}
                    </Link>
                  </td>
                  <td className="">{p.full_name ?? "—"}</td>
                  <td className="">{p.role}</td>
                  <td className="">{p.token_balance}</td>
                  <td className="">{sub ? `${sub.plan} (${sub.status})` : "besplatan"}</td>
                  <td className="">{p.is_blocked ? "blokiran" : p.onboarding_completed ? "aktivan" : "bez onboarding-a"}</td>
                  <td className="text-ink-500">{new Date(p.created_at).toLocaleDateString("sr-RS")}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {hasMore && (
        <Link href={link({ cursor: page[page.length - 1].created_at })} className="btn btn-secondary btn-sm">
          Sledeća strana
        </Link>
      )}
    </div>
  );
}
