import { contrast, mix, readable } from './kit'
import type { DesignColors, ThemeVariant } from './types'

/**
 * Ritam teme (D-132): sve objave ostaju u istom stilu, bojama i fontu (D-125), ali ne izgledaju
 * isto. Od šest objava tri su osnovne, dve obrnute (raspored u ogledalu i zamenjeni naglasci) i
 * jedna udarna (podloga u boji brenda), pa feed ima ritam umesto niza istih kartica.
 */
export const THEME_RHYTHM: readonly ThemeVariant[] = [0, 1, 0, 2, 0, 1]

/** Varijanta za objavu na mestu `index` u nizu (npr. stavka mesečnog plana). */
export function variantAt(index: number): ThemeVariant {
  const n = THEME_RHYTHM.length
  return THEME_RHYTHM[((Math.trunc(index) % n) + n) % n]!
}

/** Varijanta po oznaci (ID objave, toka ili prolaza): ista oznaka uvek daje istu varijantu. */
export function variantFor(seed: string): ThemeVariant {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return variantAt(Math.abs(h))
}

/** Druga boja se vidi na podlozi (nije ista ni preblizu): tek tada sme da preuzme ulogu naglaska. */
const visible = (color: string, on: string) => contrast(color, on) >= 1.6

/**
 * Boje varijante. Obrnuta zamenjuje dva naglaska; udarna stavlja boju brenda u podlogu, a boja
 * podloge postaje naglasak. Tekst se uvek bira tako da se čita na novoj podlozi.
 */
export function variantColors(colors: DesignColors, variant: ThemeVariant): DesignColors {
  if (variant === 1)
    return visible(colors.secondary, colors.background)
      ? { ...colors, primary: colors.secondary, secondary: colors.primary }
      : colors
  if (variant === 2) {
    const bg = colors.primary
    const fg = readable(bg)
    return {
      background: bg,
      primary: colors.background,
      secondary: visible(colors.secondary, bg) ? colors.secondary : mix(colors.background, bg, 0.35),
      text: fg,
      muted: mix(fg, bg, 0.35),
    }
  }
  return colors
}
