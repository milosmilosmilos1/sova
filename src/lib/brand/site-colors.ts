import { hexToHsl, hexToRgb } from '@/lib/visuals/design/kit'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Udaljenost dve boje u RGB prostoru (0 do 441); ispod 48 oko ih ne razlikuje na naslovnoj. */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

/** Prava boja: ne siva, skoro bela ni skoro crna. */
function chromatic(hex: string): boolean {
  const [, s, l] = hexToHsl(hex)
  return s >= 0.2 && l >= 0.12 && l <= 0.88
}

/**
 * Boje za slike profila (D-148): prave boje sa sajta redom (glavna, sporedna, naglasak, pa ostale
 * nađene), bez skoro istih. Sajt sa manje boja dopunjuje tamna boja sa sajta (crno-beli brend), pa
 * boje teme brenda.
 */
export function profileColorChoices(
  input: { site: readonly (string | null | undefined)[]; dark?: string | null; theme: readonly string[] },
  count = 3,
): string[] {
  const out: string[] = []
  const push = (c: string | null | undefined) => {
    if (!c || !HEX.test(c) || out.length >= count) return
    const up = c.toUpperCase()
    if (out.some((x) => distance(x, up) < 48)) return
    out.push(up)
  }
  for (const c of input.site) if (c && HEX.test(c) && chromatic(c)) push(c)
  push(input.dark)
  for (const c of input.theme) push(c)
  return out
}
