"use client";

import { useEffect } from "react";
import Link from "next/link";

// Hvata greške u renderovanju bilo koje strane. Nikad bela prazna strana.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[strana]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Nešto je puklo</h1>
      <p className="text-sm text-gray-600">
        Strana nije mogla da se učita. Nije do tebe. Pokušaj ponovo, a ako se ponavlja, javi nam.
      </p>
      {error.digest && <p className="text-xs text-gray-400">Kod greške: {error.digest}</p>}
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={reset} className="rounded bg-blue-600 px-4 py-2 text-white">
          Pokušaj ponovo
        </button>
        <Link href="/dashboard" className="rounded border border-gray-300 px-4 py-2">
          Početna
        </Link>
      </div>
    </main>
  );
}
