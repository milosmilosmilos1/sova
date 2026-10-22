import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { AppShell } from "@/components/app/app-shell";
import { ImpersonationBanner } from "@/components/app/impersonation-banner";

// Sve strane ispod traže: prijavu, da nalog nije blokiran, i završen onboarding.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.is_blocked) redirect("/blocked");
  if (!user.profile.onboarding_completed) redirect("/onboarding");

  const isAdmin = (user.realAdmin ?? user.profile).role === "admin";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {user.isImpersonating && <ImpersonationBanner email={user.email} />}
      <AppShell isAdmin={isAdmin} email={user.email} tokens={user.profile.token_balance}>
        {children}
      </AppShell>
    </div>
  );
}
