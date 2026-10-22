import { createClient } from "@/lib/supabase/server";
import { PLAN_TOKENS } from "@/lib/tokens";
import { PLANS, isStripeConfigured } from "@/lib/stripe/plans";
import { BillingActions } from "@/components/billing/billing-actions";

const TX_LABELS: Record<string, string> = {
  welcome: "Dobrodošlica",
  purchase: "Kupovina",
  spend: "Potrošnja",
  refund: "Povraćaj",
  admin_adjust: "Podrška",
  chargeback: "Povraćaj novca",
};

export async function BillingPanel({ userId, isImpersonating }: { userId: string; isImpersonating: boolean }) {
  const supabase = await createClient();
  const [{ data: sub }, { data: ledger }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due", "unpaid", "incomplete"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("token_transactions")
      .select("id, amount, balance_after, type, status, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("profiles").select("token_balance").eq("id", userId).single(),
  ]);

  const active = sub && (sub.status === "active" || sub.status === "trialing");

  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-ink-700">Trenutni plan</h2>
            {sub ? (
              <>
                <p className="mt-1 text-lg font-semibold text-ink-900">
                  {sub.plan === "monthly" ? "Mesečni" : "Godišnji"}{" "}
                  <span className={`badge ${active ? "badge-green" : "badge-yellow"} align-middle`}>{sub.status}</span>
                </p>
                {sub.current_period_end && (
                  <p className="text-sm text-ink-500">
                    {sub.cancel_at_period_end ? "Ističe" : "Obnavlja se"} {new Date(sub.current_period_end).toLocaleDateString("sr-RS")}
                  </p>
                )}
                {sub.status === "past_due" && <p className="mt-2 text-sm text-red-600">Naplata nije prošla. Ažuriraj karticu kroz portal.</p>}
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold text-ink-900">Besplatan</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-500">Stanje</div>
            <div className="text-2xl font-semibold text-brand-700">{profile?.token_balance ?? 0}</div>
            <div className="text-xs text-ink-500">tokena</div>
          </div>
        </div>
        {!isStripeConfigured() && <p className="mt-3 text-xs text-ink-500">Plaćanje još nije podešeno na ovom serveru.</p>}
        {isImpersonating ? (
          <p className="mt-3 text-xs text-amber-800">Plaćanje nije dostupno dok gledaš kao drugi korisnik.</p>
        ) : (
          <BillingActions hasSubscription={Boolean(active || sub?.status === "past_due")} configured={isStripeConfigured()} />
        )}
      </section>

      {!active && (
        <section className="grid gap-4 sm:grid-cols-2">
          <PlanCard title={PLANS.monthly.label} price="39 $" per="mesečno" tokens={`${PLAN_TOKENS.monthly} tokena svakog meseca`} />
          <PlanCard title={PLANS.yearly.label} price="199 $" per="godišnje" tokens={`${PLAN_TOKENS.yearly} tokena odjednom`} note="Oko 57 % jeftinije po tokenu" />
        </section>
      )}

      <section className="card card-pad">
        <h2 className="text-sm font-medium text-ink-700">Tokeni, poslednjih 30 promena</h2>
        {!ledger || ledger.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Nema promena.</p>
        ) : (
          <table className="table mt-3">
            <tbody>
              {ledger
                .filter((t) => t.status !== "released")
                .map((t) => (
                  <tr key={t.id}>
                    <td className="text-ink-500">{new Date(t.created_at).toLocaleString("sr-RS")}</td>
                    <td>{TX_LABELS[t.type] ?? t.type}</td>
                    <td className={`text-right font-medium ${t.amount > 0 ? "text-emerald-700" : "text-ink-900"}`}>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </td>
                    <td className="text-right text-ink-500">{t.balance_after}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function PlanCard({ title, price, per, tokens, note }: { title: string; price: string; per: string; tokens: string; note?: string }) {
  return (
    <div className="card card-pad">
      <h3 className="font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {price} <span className="text-sm font-normal text-ink-500">{per}</span>
      </p>
      <p className="mt-1 text-sm text-ink-700">{tokens}</p>
      {note && <p className="mt-1 text-xs text-emerald-700">{note}</p>}
    </div>
  );
}
