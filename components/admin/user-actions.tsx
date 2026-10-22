"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError, FormSuccess, Spinner } from "@/components/forms/form-ui";

export function UserActions({
  userId,
  isSelf,
  role,
  isBlocked,
  balance,
}: {
  userId: string;
  isSelf: boolean;
  role: "user" | "admin";
  isBlocked: boolean;
  balance: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<string>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    setSuccess(null);
    try {
      setSuccess(await fn());
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function adjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run("tokens", async () => {
      const { balance } = await apiFetch<{ balance: number }>(`/api/admin/users/${userId}/tokens`, {
        body: { amount: Number(f.get("amount")), note: f.get("note") },
      });
      form.reset();
      return `Novo stanje: ${balance} tokena.`;
    });
  }

  const btn = "inline-flex items-center gap-2 rounded border px-3 py-1 text-sm disabled:opacity-60";

  return (
    <section className="space-y-4 rounded border border-gray-200 p-4">
      <h2 className="font-medium">Akcije</h2>
      <FormError message={error} />
      <FormSuccess message={success} />

      <form onSubmit={adjust} className="flex flex-wrap items-end gap-2">
        <Field label={`Tokeni (sad ${balance})`} hint="Pozitivno dodaje, negativno oduzima.">
          <Input name="amount" type="number" required step={1} className="w-32" disabled={busy !== null} />
        </Field>
        <Field label="Napomena">
          <Input name="note" required minLength={3} maxLength={300} className="w-72" disabled={busy !== null} />
        </Field>
        <SubmitButton loading={busy === "tokens"}>Primeni</SubmitButton>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isSelf || busy !== null}
          onClick={() =>
            run("block", async () => {
              if (!isBlocked && !confirm("Blokirati korisnika? Odmah gubi pristup.")) throw new Error("Otkazano.");
              await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: { is_blocked: !isBlocked } });
              return isBlocked ? "Korisnik je odblokiran." : "Korisnik je blokiran.";
            })
          }
          className={`${btn} ${isBlocked ? "border-gray-300" : "border-red-600 text-red-700"}`}
        >
          {busy === "block" && <Spinner />}
          {isBlocked ? "Odblokiraj" : "Blokiraj"}
        </button>

        <button
          type="button"
          disabled={isSelf || busy !== null}
          onClick={() =>
            run("role", async () => {
              const next = role === "admin" ? "user" : "admin";
              if (!confirm(`Promeniti rolu u ${next}?`)) throw new Error("Otkazano.");
              await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: { role: next } });
              return `Rola je sada ${next}.`;
            })
          }
          className={`${btn} border-gray-300`}
        >
          {busy === "role" && <Spinner />}
          {role === "admin" ? "Skini admin rolu" : "Postavi za admina"}
        </button>

        <button
          type="button"
          disabled={isSelf || busy !== null}
          onClick={() =>
            run("imp", async () => {
              const { redirect } = await apiFetch<{ redirect: string }>(`/api/admin/users/${userId}/impersonate`, { method: "POST" });
              window.location.assign(redirect);
              return "Prebacujem…";
            })
          }
          className={`${btn} border-blue-600 text-blue-700`}
        >
          {busy === "imp" && <Spinner />}
          Uđi kao korisnik
        </button>
      </div>
      {isSelf && <p className="text-xs text-gray-500">Ovo si ti: blokiranje, rola i impersonacija nisu dostupni za sopstveni nalog.</p>}
    </section>
  );
}
