"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";

export function LogoutButton({ light = false }: { light?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;
    setLoading(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={`btn btn-sm ${light ? "text-ink-200 hover:bg-white/10" : "btn-ghost"}`}
    >
      {loading && <Spinner />}
      Odjava
    </button>
  );
}
