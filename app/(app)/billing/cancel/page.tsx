import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <h1 className="text-xl font-semibold">Nisi završio plaćanje</h1>
      <p className="text-sm text-gray-600">Ništa nije naplaćeno. Možeš da probaš ponovo kad god hoćeš.</p>
      <div className="flex justify-center gap-3 text-sm">
        <Link href="/settings?tab=billing" className="rounded bg-blue-600 px-4 py-2 text-white">
          Nazad na planove
        </Link>
        <Link href="/dashboard" className="rounded border border-gray-300 px-4 py-2">
          Na početnu
        </Link>
      </div>
    </div>
  );
}
