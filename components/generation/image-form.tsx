"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage, ApiClientError } from "@/lib/client/api";
import { ASPECT_RATIOS } from "@/lib/validation/generate";
import { Field, Textarea, Select, SubmitButton, FormError } from "@/components/forms/form-ui";
import { UploadField, type Uploaded } from "@/components/generation/upload-field";
import { GenerationView } from "@/components/generation/generation-view";
import type { GenerationDTO } from "@/lib/generation";

const RATIO_LABELS: Record<(typeof ASPECT_RATIOS)[number], string> = {
  "1:1": "1:1 (kvadrat, Instagram post)",
  "3:4": "3:4 (portret, Instagram feed)",
  "4:3": "4:3 (pejzaž)",
  "9:16": "9:16 (Story, Reels, TikTok)",
  "16:9": "16:9 (YouTube, LinkedIn)",
};

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
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <SubmitButton loading={loading} disabled={prompt.trim().length < 3 || (mode === "photo" && !image)}>
          {loading ? `Pravim sliku… ${elapsed}s` : `Generiši (${cost} tokena)`}
        </SubmitButton>
        {loading && <p className="text-xs text-gray-500">Slika obično traje 40 do 90 sekundi. Ne zatvaraj stranu.</p>}
      </form>

      <div>
        <h2 className="mb-2 text-sm font-medium">Rezultat</h2>
        {loading && <p className="text-sm text-gray-500">Radim…</p>}
        {!loading && !result && <p className="text-sm text-gray-500">Ovde se pojavljuje slika kad je napravimo.</p>}
        {!loading && result && (
          <div className="space-y-3">
            <GenerationView g={result} />
            <button type="button" onClick={() => setResult(null)} className="text-sm underline">
              Generiši ponovo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
