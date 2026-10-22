"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";

export function ImpersonationBanner({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function stop() {
    if (loading) return;
    setLoading(true);
    try {
      await apiFetch("/api/admin/impersonate/stop", { method: "POST" });
      router.push("/admin/users");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm text-amber-950">
      <span>
        Gledaš kao <strong>{email}</strong>. Sve što uradiš važi za tog korisnika i beleži se.
      </span>
      <button type="button" onClick={stop} disabled={loading} className="btn btn-sm bg-amber-950 text-amber-50 hover:bg-amber-900">
        {loading && <Spinner />}
        Izađi
      </button>
    </div>
  );
}
