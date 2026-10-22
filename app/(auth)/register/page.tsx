"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError } from "@/components/forms/form-ui";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const { redirect } = await apiFetch<{ redirect: string }>("/api/auth/register", {
        body: {
          full_name: form.get("full_name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Registracija</h1>
      <p className="text-sm text-gray-600">Dobijaš 50 besplatnih tokena.</p>
      <FormError message={error} />
      <Field label="Ime">
        <Input name="full_name" autoComplete="name" required minLength={2} disabled={loading} />
      </Field>
      <Field label="Mejl">
        <Input name="email" type="email" autoComplete="email" required disabled={loading} />
      </Field>
      <Field label="Lozinka" hint="Bar 8 znakova.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} disabled={loading} />
      </Field>
      <SubmitButton loading={loading} className="w-full">
        Napravi nalog
      </SubmitButton>
      <p className="text-sm text-gray-600">
        Već imaš nalog?{" "}
        <Link href="/login" className="underline">
          Prijavi se
        </Link>
      </p>
    </form>
  );
}
