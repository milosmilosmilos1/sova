import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { LogoutButton } from "@/components/app/logout-button";

export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile.is_blocked) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Nalog je blokiran</h1>
      <p className="mt-3 text-sm text-gray-600">
        Nalog {user.email} trenutno ne može da koristi Sovu. Ako misliš da je greška, javi se na podršku.
      </p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
