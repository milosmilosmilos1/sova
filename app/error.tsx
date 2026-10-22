"use client";

import { useEffect } from "react";
import Link from "next/link";

// Hvata greške u renderovanju bilo koje strane. Nikad bela prazna strana.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[strana]", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card card-pad w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.3 3.9L2.5 17.5A2 2 0 004.2 20.5h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-ink-900">Nešto je puklo</h1>
        <p className="mt-2 text-sm text-ink-500">Strana nije mogla da se učita. Nije do tebe. Pokušaj ponovo, a ako se ponavlja, javi nam.</p>
        {error.digest && <p className="mt-2 text-xs text-ink-400">Kod greške: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            Pokušaj ponovo
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            Početna
          </Link>
        </div>
      </div>
    </main>
  );
}
