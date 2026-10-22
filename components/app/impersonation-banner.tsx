"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";

export function ImpersonationBanner({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/admin/impersonate/stop", { method: "POST" });
      router.push("/admin/users");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-yellow-200 px-4 py-2 text-sm text-yellow-900">
      <span>
        Gledaš kao <strong>{email}</strong>. Sve što uradiš važi za tog korisnika i beleži se.
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded border border-yellow-700 px-2 py-1 disabled:opacity-60"
      >
        {loading && <Spinner />}
        Izađi
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
