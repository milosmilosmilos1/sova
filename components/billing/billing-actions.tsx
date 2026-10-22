"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner, FormError } from "@/components/forms/form-ui";

export function BillingActions({ hasSubscription, configured }: { hasSubscription: boolean; configured: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(action: "monthly" | "yearly" | "portal") {
    if (loading) return;
    setLoading(action);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        action === "portal" ? "/api/stripe/portal" : "/api/stripe/checkout",
        { method: "POST", body: action === "portal" ? {} : { plan: action } },
      );
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(null);
    }
  }

  const btn = "inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-1 disabled:opacity-60";

  return (
    <div className="mt-3 space-y-2">
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {hasSubscription ? (
          <button type="button" onClick={() => go("portal")} disabled={!configured || loading !== null} className={btn}>
            {loading === "portal" && <Spinner />}
            Upravljaj pretplatom
          </button>
        ) : (
          <>
            <button type="button" onClick={() => go("monthly")} disabled={!configured || loading !== null} className={`${btn} border-blue-600 text-blue-700`}>
              {loading === "monthly" && <Spinner />}
              Mesečni plan, 39 $
            </button>
            <button type="button" onClick={() => go("yearly")} disabled={!configured || loading !== null} className={`${btn} border-blue-600 text-blue-700`}>
              {loading === "yearly" && <Spinner />}
              Godišnji plan, 199 $
            </button>
          </>
        )}
      </div>
    </div>
  );
}
