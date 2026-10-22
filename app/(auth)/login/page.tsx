"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError } from "@/components/forms/form-ui";

const LINK_ERRORS: Record<string, string> = {
  link_expired: "Link iz mejla je istekao. Zatraži nov.",
  link_invalid: "Link iz mejla nije ispravan. Zatraži nov.",
};

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(LINK_ERRORS[params.get("error") ?? ""] ?? null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const { redirect } = await apiFetch<{ redirect: string }>("/api/auth/login", {
        body: { email: form.get("email"), password: form.get("password") },
      });
      const next = params.get("next");
      router.push(redirect === "/dashboard" && next ? safeNext(next) : redirect);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Prijava</h1>
        <p className="mt-1 text-sm text-ink-500">Dobro došao nazad.</p>
      </div>
      <FormError message={error} />
      <Field label="Mejl">
        <Input name="email" type="email" autoComplete="email" required disabled={loading} />
      </Field>
      <Field label="Lozinka">
        <Input name="password" type="password" autoComplete="current-password" required disabled={loading} />
      </Field>
      <SubmitButton loading={loading} className="w-full">
        Prijavi se
      </SubmitButton>
      <div className="flex justify-between text-sm text-ink-500">
        <Link href="/forgot-password" className="hover:text-brand-700">
          Zaboravljena lozinka?
        </Link>
        <Link href="/register" className="text-brand-700 hover:underline">
          Registruj se
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <LoginForm />
    </Suspense>
  );
}
