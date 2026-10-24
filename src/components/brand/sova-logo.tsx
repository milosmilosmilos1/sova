import { cn } from 'cn'

/** Znak Sove: oči sove u kvadratu sa plavim gradijentom (bez SVG gradijenta, pa nema sudara ID-jeva). */
export function SovaMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-grid size-7 shrink-0 place-items-center rounded-[9px] bg-linear-to-br from-brand to-brand-2 shadow-[0_0_18px_-4px_var(--glow)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 16" className="w-[72%]" fill="none">
        <circle cx="7" cy="7.5" r="5" fill="white" />
        <circle cx="17" cy="7.5" r="5" fill="white" />
        <circle cx="8" cy="8.2" r="2.2" fill="oklch(0.21 0.03 265)" />
        <circle cx="16" cy="8.2" r="2.2" fill="oklch(0.21 0.03 265)" />
        <path d="M12 11.6 10.3 14h3.4z" fill="white" />
      </svg>
    </span>
  )
}

export function SovaLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
      <SovaMark />
      Sova
    </span>
  )
}
