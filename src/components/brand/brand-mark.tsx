import type { BrandSwatch } from '@/lib/brands/swatch'
import { cn } from '@/lib/utils'

/**
 * Znak brenda (D-137): početno slovo imena na boji brenda, kao pločica mreže u `NetworkIcon`. Ukrasni
 * je, jer ime brenda uvek stoji pored, a tanak prsten ga drži vidljivim i na podlozi iste boje.
 */
export function BrandMark({
  name,
  swatch,
  size = 20,
  className,
}: {
  name: string
  swatch: BrandSwatch
  size?: number
  className?: string
}) {
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?'
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center leading-none font-semibold ring-1 ring-foreground/15 ring-inset',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(3, Math.round(size * 0.28)),
        fontSize: Math.round(size * 0.55),
        backgroundColor: swatch.color,
        color: swatch.ink,
      }}
    >
      {letter}
    </span>
  )
}
