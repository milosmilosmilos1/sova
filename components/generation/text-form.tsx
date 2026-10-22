"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, errorMessage, ApiClientError } from "@/lib/client/api";
import { PLATFORMS, TONES } from "@/lib/validation/generate";
import { Field, Textarea, Select, SubmitButton, FormError, Button } from "@/components/forms/form-ui";
import { UploadField, type Uploaded } from "@/components/generation/upload-field";
import { GenerationView } from "@/components/generation/generation-view";
import { PLATFORM_LABELS, TONE_LABELS } from "@/components/generation/labels";
import type { GenerationDTO } from "@/lib/generation";

export function TextForm({ cost, fromGeneration }: { cost: number; fromGeneration: GenerationDTO | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationDTO | null>(null);
  const [image, setImage] = useState<Uploaded | null>(null);
  const [prompt, setPrompt] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const { generation } = await apiFetch<{ generation: GenerationDTO }>("/api/generate/text", {
        body: {
          prompt,
          platform: f.get("platform"),
          tone: f.get("tone") || null,
          input_image_path: image?.path ?? null,
          from_generation_id: fromGeneration?.id ?? null,
          idempotency_key: key,
        },
      });
      setResult(generation);
      setKey(crypto.randomUUID());
      toast.success(`Tekst je spreman. Skinuto ${cost} tokena.`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CONFLICT") {
        setError("Zahtev je već poslat, sačekaj rezultat.");
      } else {
        setError(errorMessage(err));
        setKey(crypto.randomUUID());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="card card-pad space-y-5" noValidate>
        <FormError message={error} />
        {fromGeneration?.output_image_url ? (
          <div className="space-y-1.5">
            <span className="label">Slika za koju pišemo tekst</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fromGeneration.output_image_url} alt="" className="h-28 w-28 rounded-lg object-cover ring-1 ring-ink-200" />
          </div>
        ) : (
          <UploadField value={image} onChange={setImage} disabled={loading} label="Fotografija uz tekst" />
        )}
        <Field label="O čemu je objava" hint={`${prompt.length}/1000`}>
          <Textarea
            name="prompt"
            rows={4}
            maxLength={1000}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder="Npr. nova jesenja ponuda: bundeva late i domaći kolači, od ponedeljka"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mreža">
            <Select name="platform" defaultValue="instagram" disabled={loading}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ton">
            <Select name="tone" defaultValue="" disabled={loading}>
              <option value="">Kao u podešavanjima</option>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SubmitButton loading={loading} disabled={prompt.trim().length < 3} className="w-full sm:w-auto">
          {loading ? "Pišem…" : `Generiši (${cost} tokena)`}
        </SubmitButton>
      </form>

      <div className="card card-pad">
        <h2 className="mb-3 text-sm font-medium text-ink-700">Rezultat</h2>
        {loading && (
          <div className="space-y-2">
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-2/3" />
            <p className="pt-2 text-xs text-ink-500">Pišem objavu, obično traje do 10 sekundi…</p>
          </div>
        )}
        {!loading && !result && <p className="text-sm text-ink-500">Ovde se pojavljuje tekst kad ga napravimo.</p>}
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
