"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Button, EmptyState } from "@/components/forms/form-ui";
import { TYPE_LABELS, STATUS_LABELS, statusBadge } from "@/components/generation/labels";
import type { GenerationDTO } from "@/lib/generation";

type Page = { items: GenerationDTO[]; nextCursor: string | null };

// Strana remount-uje listu kroz key={type}, pa nema potrebe za efektom.
export function HistoryList({ initial, type }: { initial: Page; type: string | null }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ cursor });
      if (type) q.set("type", type);
      const page = await apiFetch<Page>(`/api/generations?${q}`);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Obrisati ovu stavku? Ne može da se vrati.")) return;
    try {
      await apiFetch(`/api/generations/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((g) => g.id !== id));
      toast.success("Obrisano.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={type ? "Nema ničega u ovom filteru" : "Još nema ničega"}
        text="Sve što napraviš ostaje ovde: tekstovi, slike, i šta je koštalo."
        action={
          <Link href="/create/text" className="btn btn-primary btn-sm">
            Napravi prvu objavu
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((g) => (
          <li key={g.id} className="card flex gap-3 p-3">
            <Link href={`/history/${g.id}`} className="shrink-0">
              {g.output_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.output_image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">Aa</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/history/${g.id}`} className="truncate text-sm font-medium text-ink-900 hover:text-brand-700">
                  {g.prompt}
                </Link>
                <span className={statusBadge(g.status)}>{STATUS_LABELS[g.status]}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                {TYPE_LABELS[g.type]} · {g.tokens_cost} tokena · {new Date(g.created_at).toLocaleString("sr-RS")}
              </p>
              {g.type === "text" && g.output_text && <p className="mt-1 line-clamp-2 text-sm text-ink-700">{g.output_text}</p>}
              <div className="mt-2 flex gap-3 text-xs">
                <Link href={`/history/${g.id}`} className="text-brand-700 hover:underline">
                  Otvori
                </Link>
                <button type="button" onClick={() => remove(g.id)} className="text-ink-500 hover:text-red-700">
                  Obriši
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={loading} onClick={loadMore}>
            Učitaj još
          </Button>
        </div>
      )}
    </div>
  );
}
