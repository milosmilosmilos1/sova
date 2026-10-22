export default function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-gray-500" role="status" aria-live="polite">
      <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Učitavanje…
    </div>
  );
}
