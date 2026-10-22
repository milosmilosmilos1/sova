import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { BusinessForm } from "@/components/forms/business-form";

// Van (app) grupe jer (app) layout traži završen onboarding.
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.is_blocked) redirect("/blocked");
  if (user.profile.onboarding_completed) redirect("/dashboard");

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-xl font-semibold">Reci nam o svom biznisu</h1>
      <p className="mb-6 text-sm text-gray-600">
        Ovo koristimo u svakom tekstu i slici koju napravimo za tebe. Možeš da promeniš kasnije u podešavanjima.
      </p>
      <BusinessForm initial={business} mode="onboarding" />
    </main>
  );
}
