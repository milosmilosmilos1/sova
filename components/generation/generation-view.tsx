"use client";

import { useState } from "react";
import Link from "next/link";
import type { GenerationDTO } from "@/lib/generation";

export const TYPE_LABELS: Record<GenerationDTO["type"], string> = {
  text: "Tekst",
  image_from_prompt: "Slika iz opisa",
  image_from_photo: "Slika iz fotografije",
};

export const STATUS_LABELS: Record<GenerationDTO["status"], string> = {
  pending: "Čeka",
  processing: "U toku",
  completed: "Gotovo",
  failed: "Nije uspelo",
};

export function GenerationView({ g, compact = false }: { g: GenerationDTO; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = [g.output_text, g.cta, g.hashtags.length ? g.hashtags.map((h) => `#${h}`).join(" ") : ""]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // stari browser bez clipboard-a; korisnik može ručno
    }
  }

  if (g.status === "failed") {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Nije uspelo ({g.error_code ?? "greška"}). Tokeni nisu skinuti.
      </div>
    );
  }
  if (g.status !== "completed") {
    return <div className="rounded border border-gray-200 p-3 text-sm text-gray-600">{STATUS_LABELS[g.status]}…</div>;
  }

  if (g.type === "text") {
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-sm">{g.output_text}</p>
        {g.cta && <p className="text-sm font-medium">{g.cta}</p>}
        {g.hashtags.length > 0 && <p className="text-sm text-blue-700">{g.hashtags.map((h) => `#${h}`).join(" ")}</p>}
        {!compact && (
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={copy} className="rounded border border-gray-300 px-3 py-1">
              {copied ? "Kopirano" : "Kopiraj sve"}
            </button>
            {g.input_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.input_image_url} alt="Fotografija uz tekst" className="h-20 w-20 rounded object-cover" />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {g.output_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.output_image_url} alt={g.prompt} className={`rounded border border-gray-200 ${compact ? "max-h-64" : "max-h-[70vh]"} w-auto`} />
      ) : (
        <p className="text-sm text-gray-500">Slika nije dostupna (link istekao). Osveži stranu.</p>
      )}
      {!compact && (
        <div className="flex flex-wrap gap-2 text-sm">
          {g.output_image_url && (
            <a href={g.output_image_url} download={`sova-${g.id}.jpg`} className="rounded border border-gray-300 px-3 py-1">
              Preuzmi
            </a>
          )}
          <Link href={`/create/text?from=${g.id}`} className="rounded border border-gray-300 px-3 py-1">
            Napravi tekst za ovu sliku
          </Link>
        </div>
      )}
    </div>
  );
}
