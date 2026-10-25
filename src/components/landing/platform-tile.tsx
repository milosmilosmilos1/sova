import type { CSSProperties } from 'react'

import { cn } from 'cn'

import { Fa, GoogleG } from './icons'
import type { LandingPlatform } from './platforms'

const RING = 'inset 0 0 0 1px rgba(255,255,255,0.16)'

/** TikTok znak sa pomerenim tirkiznim i crvenim obrisom (u dizajnu text-shadow). */
export function tiktokGlyph(offset: number): CSSProperties {
  return {
    filter: `drop-shadow(-${offset}px -${offset}px 0 #25F4EE) drop-shadow(${offset}px ${offset}px 0 #FE2C55)`,
  }
}

/**
 * Pločica mreže u bojama brenda. Veličine iz dizajna: 28/13 (hero), 38/18 (izbor mreže),
 * 48/21 (povezivanje), 24/12 (raspored objava).
 */
export function PlatformTile({
  p,
  size,
  radius,
  glyph,
  className,
  style,
  shadowOffset = 1.5,
  googleSize,
}: {
  p: LandingPlatform
  size: number | '100%'
  radius: number
  /** veličina znaka u px; Googleov „G” je 1 px veći, kao u dizajnu */
  glyph: number
  className?: string
  style?: CSSProperties
  shadowOffset?: number
  /** Googleov „G” kad odstupa od glyph + 1 (raspored objava, kalendar) */
  googleSize?: number
}) {
  return (
    <span
      title={p.name}
      className={cn('flex flex-none items-center justify-center', p.tile === 'ig' && 'l-ig', className)}
      style={{
        width: size,
        height: size === '100%' ? undefined : size,
        borderRadius: radius,
        background: p.tile === 'ig' ? undefined : p.tile,
        boxShadow: p.ring ? RING : undefined,
        ...style,
      }}
    >
      {p.icon ? (
        <Fa
          icon={p.icon}
          style={{
            fontSize: glyph,
            color: '#fff',
            ...(p.key === 'tiktok' ? tiktokGlyph(shadowOffset) : {}),
          }}
        />
      ) : (
        <GoogleG size={googleSize ?? glyph + 1} />
      )}
    </span>
  )
}
