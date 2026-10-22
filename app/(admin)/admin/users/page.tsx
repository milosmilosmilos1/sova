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
      <h1 className="text-xl font-semibold">Korisnici</h1>
      <form method="get" className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q.q ?? ""} placeholder="Mejl ili ime" className="rounded border border-gray-300 px-3 py-1" />
        <input type="hidden" name="status" value={q.status} />
        <button type="submit" className="rounded border border-gray-300 px-3 py-1">
          Traži
        </button>
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        {STATUS.map((s) => (
          <Link key={s.key} href={link({ status: s.key, cursor: undefined })} className={`rounded border px-3 py-1 ${q.status === s.key ? "border-blue-600 text-blue-700" : "border-gray-300"}`}>
            {s.label}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600">Greška: {error.message}</p>
      ) : page.length === 0 ? (
        <p className="text-sm text-gray-600">Nema korisnika za ovaj filter.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1">Mejl</th>
              <th className="py-1">Ime</th>
              <th className="py-1">Rola</th>
              <th className="py-1">Tokeni</th>
              <th className="py-1">Plan</th>
              <th className="py-1">Status</th>
              <th className="py-1">Registrovan</th>
            </tr>
          </thead>
          <tbody>
            {page.map((p) => {
              const sub = subMap.get(p.id);
              return (
                <tr key={p.id} className="border-t border-gray-200">
                  <td className="py-1">
                    <Link href={`/admin/users/${p.id}`} className="underline">
                      {p.email}
                    </Link>
                  </td>
                  <td className="py-1">{p.full_name ?? "—"}</td>
                  <td className="py-1">{p.role}</td>
                  <td className="py-1">{p.token_balance}</td>
                  <td className="py-1">{sub ? `${sub.plan} (${sub.status})` : "besplatan"}</td>
                  <td className="py-1">{p.is_blocked ? "blokiran" : p.onboarding_completed ? "aktivan" : "bez onboarding-a"}</td>
                  <td className="py-1 text-gray-500">{new Date(p.created_at).toLocaleDateString("sr-RS")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {hasMore && (
        <Link href={link({ cursor: page[page.length - 1].created_at })} className="inline-block rounded border border-gray-300 px-3 py-1 text-sm">
          Sledeća strana
        </Link>
      )}
    </div>
  );
}
