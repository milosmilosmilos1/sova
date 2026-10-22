"use client";

import Link from "next/link";
import { toast } from "sonner";
import type { GenerationDTO } from "@/lib/generation";
import { Button } from "@/components/forms/form-ui";
import { STATUS_LABELS } from "@/components/generation/labels";

export { TYPE_LABELS, STATUS_LABELS } from "@/components/generation/labels";

export function GenerationView({ g, compact = false }: { g: GenerationDTO; compact?: boolean }) {
  async function copy() {
    const text = [g.output_text, g.cta, g.hashtags.length ? g.hashtags.map((h) => `#${h}`).join(" ") : ""].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kopirano. Nalepi u objavu.");
    } catch {
      toast.error("Nisam uspeo da kopiram. Označi tekst ručno.");
    }
  }

  if (g.status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Nije uspelo ({g.error_code ?? "greška"}). Tokeni nisu skinuti.
      </div>
    );
  }
  if (g.status !== "completed") {
    return <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600">{STATUS_LABELS[g.status]}…</div>;
  }

  if (g.type === "text") {
    return (
      <div className="rise space-y-4">
        <div className="rounded-xl bg-ink-50 p-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900">{g.output_text}</p>
          {g.cta && <p className="mt-3 font-medium text-ink-900">{g.cta}</p>}
          {g.hashtags.length > 0 && <p className="mt-3 text-sm text-brand-700">{g.hashtags.map((h) => `#${h}`).join(" ")}</p>}
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={copy}>
              Kopiraj sve
            </Button>
            {g.input_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.input_image_url} alt="Fotografija uz tekst" className="ml-auto h-14 w-14 rounded-lg object-cover ring-1 ring-ink-200" />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rise space-y-4">
      {g.output_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.output_image_url} alt={g.prompt} className={`w-auto rounded-xl ring-1 ring-ink-200 ${compact ? "max-h-72" : "max-h-[70vh]"}`} />
      ) : (
        <p className="text-sm text-ink-500">Slika nije dostupna (link istekao). Osveži stranu.</p>
      )}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {g.output_image_url && (
            <a href={g.output_image_url} download={`sova-${g.id}.jpg`} className="btn btn-primary btn-sm">
              Preuzmi
            </a>
          )}
          <Link href={`/create/text?from=${g.id}`} className="btn btn-secondary btn-sm">
            Napravi tekst za ovu sliku
          </Link>
        </div>
      )}
    </div>
  );
}
