import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { LogoutButton } from "@/components/app/logout-button";
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
      <header className="border-b border-gray-200">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Sova
          </Link>
          <Link href="/create/photo">Slika iz fotografije</Link>
          <Link href="/create/text">Tekst</Link>
          <Link href="/create/image">Slika iz opisa</Link>
          <Link href="/history">Istorija</Link>
          <Link href="/stats">Statistike</Link>
          <Link href="/settings">Podešavanja</Link>
          {isAdmin && (
            <Link href="/admin" className="text-blue-700">
              Admin
            </Link>
          )}
          <span className="ml-auto rounded bg-gray-100 px-2 py-1" title="Tokeni">
            {user.profile.token_balance} tokena
          </span>
          <span className="text-gray-500">{user.email}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
