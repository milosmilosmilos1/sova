"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Field, Input, SubmitButton, FormError, FormSuccess } from "@/components/forms/form-ui";

export function AccountForm({ fullName, email }: { fullName: string | null; email: string }) {
  const router = useRouter();
  const [loadingName, setLoadingName] = useState(false);
  const [loadingPw, setLoadingPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function saveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loadingName) return;
    setLoadingName(true);
    setError(null);
    setSuccess(null);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/account", { method: "PATCH", body: { full_name: f.get("full_name") } });
      setSuccess("Ime je sačuvano.");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingName(false);
    }
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loadingPw) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("new_password") !== f.get("confirm")) {
      setError("Nove lozinke se ne poklapaju.");
      return;
    }
    setLoadingPw(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch("/api/account", {
        method: "PATCH",
        body: { current_password: f.get("current_password"), new_password: f.get("new_password") },
      });
      setSuccess("Lozinka je promenjena.");
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingPw(false);
    }
  }

  return (
    <div className="space-y-8">
      <FormError message={error} />
      <FormSuccess message={success} />
      <form onSubmit={saveName} className="space-y-4" noValidate>
        <Field label="Mejl">
          <Input value={email} disabled readOnly />
        </Field>
        <Field label="Ime">
          <Input name="full_name" defaultValue={fullName ?? ""} required minLength={2} maxLength={100} disabled={loadingName} />
        </Field>
        <SubmitButton loading={loadingName}>Sačuvaj ime</SubmitButton>
      </form>

      <form onSubmit={savePassword} className="space-y-4" noValidate>
        <h3 className="font-medium">Promena lozinke</h3>
        <Field label="Trenutna lozinka">
          <Input name="current_password" type="password" autoComplete="current-password" required disabled={loadingPw} />
        </Field>
        <Field label="Nova lozinka" hint="Bar 8 znakova.">
          <Input name="new_password" type="password" autoComplete="new-password" required minLength={8} disabled={loadingPw} />
        </Field>
        <Field label="Ponovi novu lozinku">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} disabled={loadingPw} />
        </Field>
        <SubmitButton loading={loadingPw}>Promeni lozinku</SubmitButton>
      </form>
    </div>
  );
}
