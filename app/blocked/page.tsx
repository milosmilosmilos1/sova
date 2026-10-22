import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { LogoutButton } from "@/components/app/logout-button";
import { Logo } from "@/components/ui/logo";

export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile.is_blocked) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="card card-pad w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink-900">Nalog je blokiran</h1>
        <p className="mt-3 text-sm text-ink-500">
          Nalog {user.email} trenutno ne može da koristi Sovu. Ako misliš da je greška, javi se podršci.
        </p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
