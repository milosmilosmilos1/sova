"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";
import { TYPE_LABELS, STATUS_LABELS } from "@/components/generation/generation-view";
import type { GenerationDTO } from "@/lib/generation";

type Page = { items: GenerationDTO[]; nextCursor: string | null };

// Strana remount-uje listu kroz key={type}, pa nema potrebe za efektom.
export function HistoryList({ initial, type }: { initial: Page; type: string | null }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ cursor });
      if (type) q.set("type", type);
      const page = await apiFetch<Page>(`/api/generations?${q}`);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Obrisati ovu stavku? Ne može da se vrati.")) return;
    try {
      await apiFetch(`/api/generations/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600">
        <p>Još nema ničega{type ? " u ovom filteru" : ""}.</p>
        <Link href="/create/text" className="mt-2 inline-block underline">
          Napravi prvu objavu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {items.map((g) => (
          <li key={g.id} className="flex gap-3 px-3 py-3 text-sm">
            <Link href={`/history/${g.id}`} className="flex flex-1 gap-3">
              {g.output_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.output_image_url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                  {g.type === "text" ? "Aa" : "—"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.prompt}</p>
                <p className="text-gray-500">
                  {TYPE_LABELS[g.type]} · {STATUS_LABELS[g.status]} · {g.tokens_cost} tokena ·{" "}
                  {new Date(g.created_at).toLocaleString("sr-RS")}
                </p>
                {g.type === "text" && g.output_text && <p className="truncate text-gray-700">{g.output_text}</p>}
              </div>
            </Link>
            <button type="button" onClick={() => remove(g.id)} className="self-start text-gray-500 underline">
              Obriši
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading && <Spinner />}
          Učitaj još
        </button>
      )}
    </div>
  );
}
