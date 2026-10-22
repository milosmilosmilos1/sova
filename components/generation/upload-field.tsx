"use client";

import { useRef, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/forms/form-ui";

export type Uploaded = { path: string; url: string | null; width: number; height: number };

const MAX_MB = 10;
const ACCEPT = "image/jpeg,image/png,image/webp";

// Upload fotografije: proverava veličinu i tip u browseru (brza poruka),
// server opet proverava po bajtovima. Vraća putanju u storage-u.
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
      const res = await apiFetch<Uploaded>("/api/uploads", { formData: fd });
      onChange(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">
        {label}
        {required ? "" : " (opciono)"}
      </span>
      {value ? (
        <div className="flex items-start gap-3">
          {value.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="Poslata fotografija" className="h-32 w-32 rounded border border-gray-200 object-cover" />
          )}
          <div className="space-y-1 text-sm">
            <p className="text-gray-600">
              {value.width}×{value.height}
            </p>
            <button type="button" onClick={() => onChange(null)} disabled={disabled} className="underline disabled:opacity-60">
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
          className={`flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-6 text-sm ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2 text-gray-600">
              <Spinner /> Šaljem…
            </span>
          ) : (
            <>
              <span className="text-gray-600">Prevuci fotografiju ovde ili</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="rounded border border-gray-300 px-3 py-1 disabled:opacity-60"
              >
                Izaberi fajl
              </button>
              <span className="text-xs text-gray-500">jpg, png, webp, do {MAX_MB} MB</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
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
