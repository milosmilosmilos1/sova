"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { TONES, LANGUAGES } from "@/lib/validation/business";
import { Field, Input, Textarea, Select, SubmitButton, FormError } from "@/components/forms/form-ui";
import { TONE_LABELS } from "@/components/generation/labels";
import type { Database } from "@/types/database";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

export function BusinessForm({ initial, mode }: { initial: Business | null; mode: "onboarding" | "settings" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const list = (name: string) =>
      String(f.get(name) ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    try {
      const { redirect } = await apiFetch<{ redirect: string | null }>("/api/business", {
        method: "PUT",
        body: {
          name: f.get("name"),
          industry: f.get("industry"),
          description: f.get("description"),
          target_audience: f.get("target_audience"),
          tone_of_voice: f.get("tone_of_voice") || null,
          language: f.get("language"),
          website: f.get("website"),
          instagram: f.get("instagram"),
          brand_colors: list("brand_colors"),
          default_hashtags: list("default_hashtags"),
        },
      });
      if (redirect) {
        toast.success("Dobrodošao u Sovu. Imaš 50 tokena.");
        router.push(redirect);
        router.refresh();
        return;
      }
      toast.success("Podaci o biznisu su sačuvani.");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <Field label="Ime biznisa">
        <Input name="name" required maxLength={100} defaultValue={initial?.name ?? ""} disabled={loading} placeholder="Npr. Kafić Zrno" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Delatnost" hint="Kafić, frizerski salon, teretana, agencija…">
          <Input name="industry" maxLength={100} defaultValue={initial?.industry ?? ""} disabled={loading} />
        </Field>
        <Field label="Jezik objava">
          <Select name="language" defaultValue={initial?.language ?? "sr"} disabled={loading}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l === "sr" ? "Srpski" : "Engleski"}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Opis" hint="Šta nudite, po čemu ste posebni. Ide u svaki prompt.">
        <Textarea name="description" rows={4} maxLength={1000} defaultValue={initial?.description ?? ""} disabled={loading} />
      </Field>
      <Field label="Publika" hint="Kome se obraćate.">
        <Textarea name="target_audience" rows={2} maxLength={500} defaultValue={initial?.target_audience ?? ""} disabled={loading} />
      </Field>
      <Field label="Ton">
        <Select name="tone_of_voice" defaultValue={initial?.tone_of_voice ?? ""} disabled={loading}>
          <option value="">Nije važno</option>
          {TONES.map((t) => (
            <option key={t} value={t}>
              {TONE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sajt">
          <Input name="website" maxLength={200} defaultValue={initial?.website ?? ""} disabled={loading} placeholder="https://" />
        </Field>
        <Field label="Instagram">
          <Input name="instagram" maxLength={100} defaultValue={initial?.instagram ?? ""} disabled={loading} placeholder="@profil" />
        </Field>
      </div>
      <Field label="Boje brenda" hint="Hex vrednosti odvojene zarezom, npr. #1D4ED8, #F59E0B. Najviše 5.">
        <Input name="brand_colors" defaultValue={(initial?.brand_colors ?? []).join(", ")} disabled={loading} />
      </Field>
      <Field label="Hashtag-ovi" hint="Odvojeni zarezom ili razmakom. Najviše 30.">
        <Input name="default_hashtags" defaultValue={(initial?.default_hashtags ?? []).map((h) => `#${h}`).join(" ")} disabled={loading} />
      </Field>
      <SubmitButton loading={loading}>{mode === "onboarding" ? "Sačuvaj i nastavi" : "Sačuvaj"}</SubmitButton>
    </form>
  );
}
