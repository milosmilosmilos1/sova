import { readable } from '@/lib/visuals/design/kit'

/**
 * Boja brenda u aplikaciji (D-137): znak sa početnim slovom u biraču brenda, na listi brendova i na
 * početnoj. Boja je izabrana u Vizuelnom identitetu ili dolazi sa sajta; brend bez palete dobija
 * rezervnu boju po svom ID-ju, da se brendovi i tada razlikuju.
 */
export interface BrandSwatch {
  /** pozadina znaka */
  color: string
  /** početno slovo, čitljivo na boji */
  ink: string
}

const FALLBACK = ['#2563EB', '#0F766E', '#C2410C', '#7C3AED', '#BE185D', '#0E7490', '#4D7C0F', '#B45309']
const HEX = /^#[0-9a-fA-F]{6}$/

export function brandSwatch(brandId: string, primary?: string | null): BrandSwatch {
  const color =
    primary && HEX.test(primary) ? primary.toUpperCase() : FALLBACK[spread(brandId) % FALLBACK.length]!
  return { color, ink: readable(color) }
}

/** Isti ID uvek daje istu rezervnu boju. */
function spread(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
