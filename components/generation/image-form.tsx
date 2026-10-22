"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, errorMessage, ApiClientError } from "@/lib/client/api";
import { ASPECT_RATIOS } from "@/lib/validation/generate";
import { Field, Textarea, Select, SubmitButton, FormError, Button } from "@/components/forms/form-ui";
import { UploadField, type Uploaded } from "@/components/generation/upload-field";
import { GenerationView } from "@/components/generation/generation-view";
import { RATIO_LABELS } from "@/components/generation/labels";
import type { GenerationDTO } from "@/lib/generation";

export function ImageForm({ mode, cost }: { mode: "image" | "photo"; cost: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationDTO | null>(null);
  const [image, setImage] = useState<Uploaded | null>(null);
  const [prompt, setPrompt] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [elapsed, setElapsed] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    if (mode === "photo" && !image) {
      setError("Prvo pošalji fotografiju.");
      return;
    }
    setLoading(true);
    setError(null);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    const f = new FormData(e.currentTarget);
    try {
      const url = mode === "photo" ? "/api/generate/photo" : "/api/generate/image";
      const { generation } = await apiFetch<{ generation: GenerationDTO }>(url, {
        body: {
          prompt,
          aspect_ratio: f.get("aspect_ratio"),
          ...(mode === "photo" ? { input_image_path: image?.path } : {}),
          idempotency_key: key,
        },
      });
      setResult(generation);
      setKey(crypto.randomUUID());
      toast.success(`Slika je spremna. Skinuto ${cost} tokena.`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CONFLICT") {
        setError("Zahtev je već poslat, sačekaj rezultat u istoriji.");
      } else {
        setError(errorMessage(err));
        setKey(crypto.randomUUID());
      }
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="card card-pad space-y-5" noValidate>
        <FormError message={error} />
        {mode === "photo" && <UploadField value={image} onChange={setImage} disabled={loading} label="Tvoja fotografija" required />}
        <Field label={mode === "photo" ? "Kakvu sliku želiš od ove fotografije" : "Opiši sliku"} hint={`${prompt.length}/1000`}>
          <Textarea
            name="prompt"
            rows={4}
            maxLength={1000}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder={
              mode === "photo"
                ? "Npr. stavi proizvod na mermerni sto sa jutarnjim svetlom, blaga pozadina"
                : "Npr. šolja kafe na drvenom stolu pored prozora, jutarnje svetlo, topla atmosfera"
            }
          />
        </Field>
        <Field label="Format">
          <Select name="aspect_ratio" defaultValue="1:1" disabled={loading}>
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>
                {RATIO_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2">
          <SubmitButton loading={loading} disabled={prompt.trim().length < 3 || (mode === "photo" && !image)} className="w-full sm:w-auto">
            {loading ? `Pravim sliku… ${elapsed}s` : `Generiši (${cost} tokena)`}
          </SubmitButton>
          {loading && <p className="text-xs text-ink-500">Slika obično traje 40 do 90 sekundi. Ne zatvaraj stranu.</p>}
        </div>
      </form>

      <div className="card card-pad">
        <h2 className="mb-3 text-sm font-medium text-ink-700">Rezultat</h2>
        {loading && (
          <div className="space-y-3">
            <div className="skeleton aspect-square w-full max-w-sm" />
            <p className="text-xs text-ink-500">Radim…</p>
          </div>
        )}
        {!loading && !result && <p className="text-sm text-ink-500">Ovde se pojavljuje slika kad je napravimo.</p>}
        {!loading && result && (
          <div className="space-y-4">
            <GenerationView g={result} />
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Generiši ponovo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
