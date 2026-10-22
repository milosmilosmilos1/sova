"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/forms/form-ui";

export function BillingActions({ hasSubscription, configured }: { hasSubscription: boolean; configured: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function go(action: "monthly" | "yearly" | "portal") {
    if (loading) return;
    setLoading(action);
    try {
      const { url } = await apiFetch<{ url: string }>(action === "portal" ? "/api/stripe/portal" : "/api/stripe/checkout", {
        method: "POST",
        body: action === "portal" ? {} : { plan: action },
      });
      window.location.assign(url);
    } catch (e) {
      toast.error(errorMessage(e));
      setLoading(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {hasSubscription ? (
        <Button variant="secondary" loading={loading === "portal"} disabled={!configured || loading !== null} onClick={() => go("portal")}>
          Upravljaj pretplatom
        </Button>
      ) : (
        <>
          <Button variant="primary" loading={loading === "monthly"} disabled={!configured || loading !== null} onClick={() => go("monthly")}>
            Mesečni plan, 39 $
          </Button>
          <Button variant="secondary" loading={loading === "yearly"} disabled={!configured || loading !== null} onClick={() => go("yearly")}>
            Godišnji plan, 199 $
          </Button>
        </>
      )}
    </div>
  );
}
