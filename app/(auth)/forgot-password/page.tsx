"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError, FormSuccess } from "@/components/forms/form-ui";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/forgot-password", { body: { email: form.get("email") } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Proveri mejl</h1>
        <FormSuccess message="Ako nalog postoji, poslali smo link za novu lozinku. Link važi 1 sat." />
        <p className="text-sm text-gray-600">
          <Link href="/login" className="underline">
            Nazad na prijavu
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Zaboravljena lozinka</h1>
      <p className="text-sm text-gray-600">Unesi mejl i poslaćemo ti link za novu lozinku.</p>
      <FormError message={error} />
      <Field label="Mejl">
        <Input name="email" type="email" autoComplete="email" required disabled={loading} />
      </Field>
      <SubmitButton loading={loading} className="w-full">
        Pošalji link
      </SubmitButton>
      <p className="text-sm text-gray-600">
        <Link href="/login" className="underline">
          Nazad na prijavu
        </Link>
      </p>
    </form>
  );
}
