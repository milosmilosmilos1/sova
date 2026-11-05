'use client'

import { useState } from 'react'

import type { BrandSwatch } from '@/lib/brands/swatch'
import { cn } from '@/lib/utils'

/**
 * Znak brenda (D-137, D-155): ikonica kvadratnog logoa, a bez nje početno slovo imena na boji brenda,
 * kao pločica mreže u `NetworkIcon`. Ukrasni je, jer ime brenda uvek stoji pored, a tanak prsten ga
 * drži vidljivim i na podlozi iste boje. Logo koji ne stigne ostavlja slovo.
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
  const [broken, setBroken] = useState<string | null>(null)
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?'
  const logo = swatch.logo && swatch.logo !== broken ? swatch.logo : null
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden leading-none font-semibold ring-1 ring-foreground/15 ring-inset',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(3, Math.round(size * 0.28)),
        fontSize: Math.round(size * 0.55),
        backgroundColor: logo ? undefined : swatch.color,
        color: swatch.ink,
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- mala ikonica iz API-ja, bez optimizacije
        <img
          src={logo}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setBroken(logo)}
        />
      ) : (
        letter
      )}
    </span>
  )
}
