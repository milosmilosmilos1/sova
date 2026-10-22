import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserActions } from "@/components/admin/user-actions";

export default async function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = (await getCurrentUser())!;
  const meId = (me.realAdmin ?? me.profile).id;
  const admin = createAdminClient();

  const [{ data: profile }, { data: business }, { data: subs }, { data: gens }, { data: ledger }, { data: payments }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("businesses").select("name, industry, language").eq("user_id", id).maybeSingle(),
    admin.from("subscriptions").select("plan, status, current_period_end, cancel_at_period_end").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("generations").select("id, type, status, prompt, tokens_cost, model, error_code, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("token_transactions").select("id, amount, balance_after, type, status, note, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("payments").select("stripe_invoice_id, amount_paid, currency, status, tokens_granted, paid_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm underline">
        ← Korisnici
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{profile.email}</h1>
        <p className="text-sm text-gray-600">
          {profile.full_name ?? "bez imena"} · {profile.role} · {profile.token_balance} tokena · {profile.is_blocked ? "BLOKIRAN" : "aktivan"} ·
          registrovan {new Date(profile.created_at).toLocaleDateString("sr-RS")}
        </p>
        {business && (
          <p className="text-sm text-gray-600">
            Biznis: {business.name} ({business.industry ?? "—"}, {business.language})
          </p>
        )}
      </div>

      <UserActions userId={profile.id} isSelf={profile.id === meId} role={profile.role as "user" | "admin"} isBlocked={profile.is_blocked} balance={profile.token_balance} />

      <section className="text-sm">
        <h2 className="mb-1 font-medium">Pretplate</h2>
        {!subs?.length ? (
          <p className="text-gray-600">Nema pretplata.</p>
        ) : (
          <ul className="list-disc pl-5">
            {subs.map((s, i) => (
              <li key={i}>
                {s.plan} · {s.status} · do {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("sr-RS") : "?"}
                {s.cancel_at_period_end ? " · otkazuje se" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-sm">
        <h2 className="mb-1 font-medium">Uplate</h2>
        {!payments?.length ? (
          <p className="text-gray-600">Nema uplata.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {payments.map((p) => (
                <tr key={p.stripe_invoice_id} className="border-t border-gray-200">
                  <td className="py-1 text-gray-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString("sr-RS") : "—"}</td>
                  <td className="py-1">{(p.amount_paid / 100).toFixed(2)} {p.currency?.toUpperCase()}</td>
                  <td className="py-1">{p.status}</td>
                  <td className="py-1">+{p.tokens_granted} tokena</td>
                  <td className="py-1 text-gray-500">{p.stripe_invoice_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="text-sm">
        <h2 className="mb-1 font-medium">Poslednje generacije</h2>
        {!gens?.length ? (
          <p className="text-gray-600">Nema generacija.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {gens.map((g) => (
                <tr key={g.id} className="border-t border-gray-200">
                  <td className="py-1 text-gray-500">{new Date(g.created_at).toLocaleString("sr-RS")}</td>
                  <td className="py-1">{g.type}</td>
                  <td className="py-1">{g.status}{g.error_code ? ` (${g.error_code})` : ""}</td>
                  <td className="max-w-md truncate py-1">{g.prompt}</td>
                  <td className="py-1 text-gray-500">{g.model ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="text-sm">
        <h2 className="mb-1 font-medium">Tokeni, poslednjih 30 promena</h2>
        {!ledger?.length ? (
          <p className="text-gray-600">Nema promena.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {ledger.map((t) => (
                <tr key={t.id} className="border-t border-gray-200">
                  <td className="py-1 text-gray-500">{new Date(t.created_at).toLocaleString("sr-RS")}</td>
                  <td className="py-1">{t.type}{t.status !== "completed" ? ` (${t.status})` : ""}</td>
                  <td className={`py-1 text-right ${t.amount > 0 ? "text-green-700" : ""}`}>{t.amount > 0 ? "+" : ""}{t.amount}</td>
                  <td className="py-1 text-right text-gray-500">{t.balance_after}</td>
                  <td className="py-1 text-gray-500">{t.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
