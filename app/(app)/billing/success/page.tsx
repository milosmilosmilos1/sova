import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";

// Stripe vraća ovde posle plaćanja. Tokeni stižu kroz webhook (invoice.paid),
// obično u roku od par sekundi; strana samo pokazuje trenutno stanje.
export default async function BillingSuccessPage() {
  const user = (await getCurrentUser())!;
  return (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <h1 className="text-xl font-semibold">Hvala, plaćanje je prošlo</h1>
      <p className="text-sm text-gray-600">
        Tokeni stižu za koji sekund. Trenutno stanje: <strong>{user.profile.token_balance}</strong> tokena. Ako se broj ne
        promeni za minut, osveži stranu ili pogledaj podešavanja.
      </p>
      <div className="flex justify-center gap-3 text-sm">
        <Link href="/dashboard" className="rounded bg-blue-600 px-4 py-2 text-white">
          Na početnu
        </Link>
        <Link href="/settings?tab=billing" className="rounded border border-gray-300 px-4 py-2">
          Pretplata
        </Link>
      </div>
    </div>
  );
}
