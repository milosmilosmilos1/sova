import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <div className="space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-ink-900">Proveri mejl</h1>
      <p className="text-sm text-ink-500">Poslali smo ti link za potvrdu naloga. Klikni na njega i vraćamo te u aplikaciju.</p>
      <p className="text-sm text-ink-500">
        Nema mejla? Pogledaj spam ili{" "}
        <Link href="/login" className="text-brand-700 hover:underline">
          probaj da se prijaviš
        </Link>
        .
      </p>
    </div>
  );
}
