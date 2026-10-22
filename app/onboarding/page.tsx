import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { BusinessForm } from "@/components/forms/business-form";
import { Logo } from "@/components/ui/logo";

// Van (app) grupe jer (app) layout traži završen onboarding.
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.is_blocked) redirect("/blocked");
  if (user.profile.onboarding_completed) redirect("/dashboard");

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("user_id", user.id).maybeSingle();

  return (
    <main className="flex flex-1 flex-col items-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="card card-pad w-full max-w-xl">
        <span className="badge badge-blue">Korak 1 od 1</span>
        <h1 className="mt-3 text-xl font-semibold text-ink-900">Reci nam o svom biznisu</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">
          Ovo koristimo u svakom tekstu i slici koju napravimo za tebe. Dovoljno je ime, ostalo možeš i kasnije u podešavanjima.
        </p>
        <BusinessForm initial={business} mode="onboarding" />
      </div>
    </main>
  );
}
