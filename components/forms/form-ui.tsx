"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input resize-y ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ""}`} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  loading,
  variant = "primary",
  size,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: Variant; size?: "sm" }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={loading || rest.disabled}
      aria-busy={loading}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${rest.className ?? ""}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function SubmitButton({
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <Button {...rest} type="submit" loading={loading} variant="primary">
      {children}
    </Button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
      {message}
    </p>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-medium text-ink-900">{title}</p>
      {text && <p className="max-w-sm text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
