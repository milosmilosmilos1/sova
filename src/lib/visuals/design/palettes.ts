import { contrast, hexToHsl, hslToHex, mix, readable } from './kit'
import type { DesignColors } from './types'

/**
 * Šarene palete za plan objava (D-121): pune, žive podloge sa čitljivim tekstom i dva naglaska.
 * Uloge su iste kao u dizajnu brenda: pozadina, tekst, naglasak (primary) i drugi naglasak.
 */
export interface Palette {
  id: string
  colors: DesignColors
}

const palette = (id: string, background: string, text: string, primary: string, secondary: string) => ({
  id,
  colors: { background, text, primary, secondary, muted: mix(text, background, 0.35) },
})

export const VIVID_PALETTES: Palette[] = [
  palette('lemon', '#FFD60A', '#1B1B3A', '#FF006E', '#3A86FF'),
  palette('grape', '#6A00F4', '#FFFFFF', '#FFBE0B', '#FF5DA2'),
  palette('mint', '#06D6A0', '#073B4C', '#EF476F', '#FFD166'),
  palette('electric', '#2B59FF', '#FFFFFF', '#FFD60A', '#00F5D4'),
  palette('berry', '#D90368', '#FFFFFF', '#FFD60A', '#2E294E'),
  palette('midnight', '#14213D', '#FFFFFF', '#FCA311', '#4CC9F0'),
  palette('peach', '#FFB4A2', '#2B2D42', '#E5383B', '#6D597A'),
  palette('sky', '#4CC9F0', '#10002B', '#F72585', '#FFD60A'),
  palette('tomato', '#C1121F', '#FFFFFF', '#FFD60A', '#FDF0D5'),
  palette('teal', '#00798C', '#FFFFFF', '#EDAE49', '#D1495B'),
  palette('forest', '#1B4332', '#FFFFFF', '#95D5B2', '#FFD166'),
  palette('lilac', '#CDB4DB', '#2D0B4E', '#FF006E', '#FFC75F'),
]

/**
 * Tri palete iz boje brenda: puna boja, tamna i svetla nijansa, sa suprotnom bojom kao naglaskom.
 * Ugašena ili siva boja brenda dobija malo više života, a bezbojna uzima drugu boju brenda ili plavu.
 */
export function brandPalettes(brand: DesignColors): Palette[] {
  const [h1, s1] = hexToHsl(brand.primary)
  const [h2, s2] = hexToHsl(brand.secondary)
  const hue = s1 >= 0.12 ? h1 : s2 >= 0.12 ? h2 : 222
  const sat = Math.max(s1 >= 0.12 ? s1 : s2, 0.6)
  const solid = hslToHex(hue, sat, 0.5)
  const deep = hslToHex(hue, Math.min(1, sat), 0.16)
  const tint = hslToHex(hue, Math.min(1, sat * 0.9), 0.92)
  const opposite = hslToHex(hue + 180, 0.85, 0.6)
  const warm = hslToHex(hue + 40, 0.9, 0.58)
  const solidText = readable(solid)
  return [
    palette(
      'brand',
      solid,
      solidText,
      contrast(opposite, solid) >= 1.6 ? opposite : '#FFD60A',
      contrast(warm, solid) >= 1.4 ? warm : mix(solid, solidText, 0.35),
    ),
    palette('brand-deep', deep, '#FFFFFF', hslToHex(hue, sat, 0.62), opposite),
    palette('brand-tint', tint, readable(tint, hslToHex(hue, 0.6, 0.16)), solid, opposite),
  ]
}
