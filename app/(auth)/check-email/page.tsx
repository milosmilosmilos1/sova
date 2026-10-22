import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Proveri mejl</h1>
      <p className="text-sm text-gray-600">
        Poslali smo ti link za potvrdu naloga. Klikni na njega i vraćamo te u aplikaciju.
      </p>
      <p className="text-sm text-gray-600">
        Nema mejla? Pogledaj spam ili{" "}
        <Link href="/login" className="underline">
          probaj da se prijaviš
        </Link>
        .
      </p>
    </div>
  );
}
