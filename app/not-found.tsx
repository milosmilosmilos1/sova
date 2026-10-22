import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card card-pad w-full max-w-md text-center">
        <p className="text-5xl font-semibold tracking-tight text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">Strana ne postoji</h1>
        <p className="mt-2 text-sm text-ink-500">Link je pogrešan ili je ono što tražiš obrisano.</p>
        <Link href="/dashboard" className="btn btn-primary mt-6">
          Na početnu
        </Link>
      </div>
    </main>
  );
}
