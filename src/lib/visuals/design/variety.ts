import type { StyleId } from './catalog'
import { brandPalettes, VIVID_PALETTES } from './palettes'
import type { DesignColors } from './types'

/**
 * Šaren plan (D-121): svaka objava dobija drugi stil i drugu paletu, a svaki stil nosi fotografiju. Svaka treća objava je u bojama brenda, ostale u šarenim paletama, bez dve iste
 * zaredom. Izbor zavisi samo od mesta u planu i semena plana, pa je isti i pri ponovnom pravljenju.
 */
export const VIVID_CYCLE: StyleId[] = [
  'magazine',
  'pop',
  'split',
  'sticker',
  'blocks',
  'aurora',
  'poster',
  'duotone',
  'framed',
  'event',
]

export interface Look {
  styleId: StyleId
  colors: DesignColors
  paletteId: string
}

/** Seme iz ID-ja plana: različiti planovi počinju od različitog stila i palete. */
export function seedFrom(value: string): number {
  let h = 0
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) % 9973
  return h
}

export function planLook(position: number, seed: number, brand: DesignColors): Look {
  const styleId = VIVID_CYCLE[(position + seed) % VIVID_CYCLE.length]!
  if (position % 3 === 0) {
    const own = brandPalettes(brand)
    const p = own[(Math.floor(position / 3) + seed) % own.length]!
    return { styleId, colors: p.colors, paletteId: p.id }
  }
  // mesta 1, 2, 4, 5, 7, 8… idu redom kroz šarene palete
  const k = position - Math.floor(position / 3) - 1
  const p = VIVID_PALETTES[(k + seed) % VIVID_PALETTES.length]!
  return { styleId, colors: p.colors, paletteId: p.id }
}
