import { createClient } from "@/lib/supabase/server";
import { PLAN_TOKENS } from "@/lib/tokens";
import { PLANS, isStripeConfigured } from "@/lib/stripe/plans";
import { BillingActions } from "@/components/billing/billing-actions";

// Tab "Pretplata" u podešavanjima: trenutni plan, dugmad, ledger tokena.
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
      <section className="rounded border border-gray-200 p-4 text-sm">
        <h2 className="font-medium">Trenutni plan</h2>
        {sub ? (
          <div className="mt-1 space-y-1">
            <p>
              {sub.plan === "monthly" ? "Mesečni (39 $, 500 tokena)" : "Godišnji (199 $, 6000 tokena)"} · status: {sub.status}
            </p>
            {sub.current_period_end && (
              <p className="text-gray-600">
                {sub.cancel_at_period_end ? "Ističe" : "Obnavlja se"} {new Date(sub.current_period_end).toLocaleDateString("sr-RS")}
              </p>
            )}
            {sub.status === "past_due" && (
              <p className="text-red-600">Naplata nije prošla. Ažuriraj karticu kroz portal da bi dobio nove tokene.</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-gray-600">Besplatan nalog. Stanje: {profile?.token_balance ?? 0} tokena.</p>
        )}
        {!isStripeConfigured() && (
          <p className="mt-2 text-xs text-gray-500">Plaćanje još nije podešeno na ovom serveru.</p>
        )}
        {isImpersonating ? (
          <p className="mt-2 text-xs text-yellow-800">Plaćanje nije dostupno dok gledaš kao drugi korisnik.</p>
        ) : (
          <BillingActions hasSubscription={Boolean(active || sub?.status === "past_due")} configured={isStripeConfigured()} />
        )}
      </section>

      <section className="text-sm">
        <h2 className="font-medium">Planovi</h2>
        <ul className="mt-1 list-disc pl-5 text-gray-700">
          <li>Besplatno: 50 tokena na početku.</li>
          <li>
            {PLANS.monthly.label}: {PLANS.monthly.priceLabel}, {PLAN_TOKENS.monthly} tokena mesečno.
          </li>
          <li>
            {PLANS.yearly.label}: {PLANS.yearly.priceLabel}, {PLAN_TOKENS.yearly} tokena odjednom.
          </li>
          <li>Tekst 2 tokena, slika 8 tokena. Tokeni ne ističu.</li>
        </ul>
      </section>

      <section className="text-sm">
        <h2 className="font-medium">Tokeni, poslednjih 30 promena</h2>
        {!ledger || ledger.length === 0 ? (
          <p className="text-gray-600">Nema promena.</p>
        ) : (
          <table className="mt-1 w-full">
            <tbody>
              {ledger
                .filter((t) => t.status !== "released")
                .map((t) => (
                  <tr key={t.id} className="border-t border-gray-200">
                    <td className="py-1 text-gray-500">{new Date(t.created_at).toLocaleString("sr-RS")}</td>
                    <td className="py-1">{t.type}</td>
                    <td className={`py-1 text-right ${t.amount > 0 ? "text-green-700" : ""}`}>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </td>
                    <td className="py-1 text-right text-gray-500">{t.balance_after}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
