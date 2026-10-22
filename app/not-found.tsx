import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Strana ne postoji</h1>
      <p className="text-sm text-gray-600">Link je pogrešan ili je ono što tražiš obrisano.</p>
      <Link href="/dashboard" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
        Na početnu
      </Link>
    </main>
  );
}
