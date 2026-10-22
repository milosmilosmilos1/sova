import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { BusinessForm } from "@/components/forms/business-form";
import { AccountForm } from "@/components/forms/account-form";
import { BillingPanel } from "@/components/billing/billing-panel";

const TABS = [
  { key: "business", label: "Biznis" },
  { key: "account", label: "Nalog" },
  { key: "billing", label: "Pretplata" },
] as const;

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = (await getCurrentUser())!;
  const { tab: rawTab } = await props.searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "business";

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("user_id", user.id).maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Podešavanja</h1>
        <p className="page-sub">Biznis, nalog i pretplata.</p>
      </div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/settings?tab=${t.key}`} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="max-w-2xl">
        {tab === "business" && (
          <div className="card card-pad">
            <BusinessForm initial={business} mode="settings" />
          </div>
        )}
        {tab === "account" && <AccountForm fullName={user.profile.full_name} email={user.email} />}
        {tab === "billing" && <BillingPanel userId={user.id} isImpersonating={user.isImpersonating} />}
      </div>
    </div>
  );
}
