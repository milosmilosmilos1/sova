import Link from "next/link";

// Jednostavan znak: sova od dva kruga i "kljuna" u plavom kvadratu.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#2563eb" />
      <circle cx="11.5" cy="14" r="4.2" fill="#fff" />
      <circle cx="20.5" cy="14" r="4.2" fill="#fff" />
      <circle cx="11.5" cy="14" r="1.8" fill="#1e3a8a" />
      <circle cx="20.5" cy="14" r="1.8" fill="#1e3a8a" />
      <path d="M16 17.5l-2.2 3h4.4z" fill="#fbbf24" />
      <path d="M7 9.5c1.5-2.6 4-4 9-4s7.5 1.4 9 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-ink-900"}`}>Sova</span>
    </Link>
  );
}
