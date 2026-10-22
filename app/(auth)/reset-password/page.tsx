"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError } from "@/components/forms/form-ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Lozinke se ne poklapaju.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { redirect } = await apiFetch<{ redirect: string }>("/api/auth/reset-password", { body: { password } });
      toast.success("Lozinka je promenjena.");
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Nova lozinka</h1>
        <p className="mt-1 text-sm text-ink-500">Izaberi novu lozinku za svoj nalog.</p>
      </div>
      <FormError message={error} />
      <Field label="Nova lozinka" hint="Bar 8 znakova.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} disabled={loading} />
      </Field>
      <Field label="Ponovi lozinku">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} disabled={loading} />
      </Field>
      <SubmitButton loading={loading} className="w-full">
        Sačuvaj lozinku
      </SubmitButton>
    </form>
  );
}
