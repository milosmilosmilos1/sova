"use client";

import { useRef, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";

export type Uploaded = { path: string; url: string | null; width: number; height: number };

const MAX_MB = 10;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function UploadField({
  value,
  onChange,
  disabled,
  label = "Fotografija",
  required,
}: {
  value: Uploaded | null;
  onChange: (v: Uploaded | null) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || uploading) return;
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Može samo jpg, png ili webp.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Fajl je prevelik. Najviše ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      onChange(await apiFetch<Uploaded>("/api/uploads", { formData: fd }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="label">
        {label}
        {required ? "" : <span className="font-normal text-ink-400"> (opciono)</span>}
      </span>
      {value ? (
        <div className="flex items-start gap-4 rounded-xl border border-ink-200 bg-white p-3">
          {value.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="Poslata fotografija" className="h-28 w-28 rounded-lg object-cover" />
          )}
          <div className="space-y-2 text-sm">
            <p className="text-ink-500">
              {value.width}×{value.height} px
            </p>
            <button type="button" onClick={() => onChange(null)} disabled={disabled} className="btn btn-secondary btn-sm">
              Ukloni
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-ink-50/60 hover:border-brand-300"
          }`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2 text-ink-600">
              <Spinner /> Šaljem…
            </span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
              </svg>
              <span className="text-ink-600">Prevuci fotografiju ovde ili</span>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="btn btn-secondary btn-sm">
                Izaberi fajl
              </button>
              <span className="text-xs text-ink-400">jpg, png, webp, do {MAX_MB} MB</span>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" disabled={disabled || uploading} onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
