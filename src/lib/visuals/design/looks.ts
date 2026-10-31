import type { StyleId } from './catalog'
import { contrast, hexToHsl, hslToHex, luminance, mix, readable } from './kit'
import type { DesignColors } from './types'

/**
 * Izgled brenda (D-123): Sova poseti sajt i od njegovih boja i fontova napravi tri predloga, a
 * četvrti sastavlja korisnik od tri boje i fonta. Izgled je stil, pet boja i font; izabrani važi
 * za sve objave (plan, Studio, tokovi). Sme u klijentski kod: birač računa boje svog izbora sam.
 */
export const LOOK_IDS = ['site-1', 'site-2', 'site-3', 'custom'] as const
export type LookId = (typeof LOOK_IDS)[number]

/** Boje i fontovi sa sajta, kako ih je Sova našla pri poslednjoj poseti. */
export interface SiteVisual {
  url: string
  /** kad je sajt posećen (ISO) */
  at: string
  /** `profile`: sajt nije mogao da se otvori, pa važe boje iz analize brenda */
  source: 'site' | 'profile'
  primary: string
  secondary: string
  accent: string
  light: string
  dark: string
  headings: string
  body: string
}

export interface LookOption {
  id: LookId
  styleId: StyleId
  colors: DesignColors
  fonts: { headings: string; body: string }
}

/** Stil svakog predloga: svetao sa fotografijom na vrhu, taman preko fotografije i odvažan u punoj boji. */
export const SITE_LOOK_STYLES: Record<Exclude<LookId, 'custom'>, StyleId> = {
  'site-1': 'split',
  'site-2': 'poster',
  'site-3': 'blocks',
}

/** Stil za sopstveni izgled kad brend još nema svoj: klasična objava sa fotografijom u okviru. */
export const CUSTOM_LOOK_STYLE: StyleId = 'framed'

const HEX = /^#[0-9a-fA-F]{6}$/
const hex = (value: string, fallback: string) => (HEX.test(value) ? value.toUpperCase() : fallback)

/** Prva boja koja se dovoljno vidi na podlozi; inače rezerva. */
function visibleOn(bg: string, candidates: string[], min: number, fallback: string): string {
  return candidates.find((c) => contrast(c, bg) >= min) ?? fallback
}

/** Boja brenda sa malo više života kad je sajt sivkast (logo i dugmad su često jedine boje). */
function lively(color: string, fallbackHue: number): string {
  const [h, s, l] = hexToHsl(color)
  if (s >= 0.18) return color
  return hslToHex(s >= 0.05 ? h : fallbackHue, 0.55, Math.min(0.5, Math.max(0.35, l)))
}

/**
 * Tri predloga sa sajta. Svetli zadržava boje sajta na beloj (ili svetloj sa sajta) podlozi, tamni
 * stavlja jak naglasak na tamnu podlogu, a treći uzima glavnu boju brenda za podlogu. Tekst je
 * uvek čitljiv (4,5:1), a naglasak vidljiv na svojoj podlozi. Treća boja sa sajta (`accent`) ide
 * poslednja: često je iz šablona sajta (zelena „uspeh”, plavi link), a ne boja brenda.
 */
export function siteLooks(v: SiteVisual): LookOption[] {
  const primary = lively(hex(v.primary, '#2563EB'), 222)
  const secondary = hex(v.secondary, mix(primary, '#000000', 0.25))
  const accent = hex(v.accent, mix(primary, '#FFFFFF', 0.3))
  const fonts = { headings: v.headings || 'Inter', body: v.body || v.headings || 'Inter' }
  const [hue, sat] = hexToHsl(primary)

  const light = HEX.test(v.light) && luminance(v.light) > 0.8 ? v.light.toUpperCase() : '#FFFFFF'
  const lightText = readable(light, hex(v.dark, '#111827'))
  const lightAccent = visibleOn(light, [primary, secondary, accent], 2.2, hslToHex(hue, sat, 0.38))

  const dark = HEX.test(v.dark) && luminance(v.dark) < 0.04 ? v.dark.toUpperCase() : hslToHex(hue, 0.45, 0.1)
  const darkText = readable(dark, '#F8FAFC')
  // glavna boja brenda u svetlijoj nijansi, da se vidi na tamnom
  const brandGlow = hslToHex(hue, Math.max(sat, 0.55), 0.62)
  const glow = visibleOn(dark, [secondary, brandGlow, primary, accent], 3, hslToHex(hue, 0.85, 0.66))
  const darkSecond = visibleOn(
    dark,
    [brandGlow, primary, secondary, accent].filter((c) => c !== glow),
    2,
    mix(glow, darkText, 0.5),
  )

  const solid = primary
  const solidText = readable(solid)
  const pop = visibleOn(solid, [secondary, light, accent, hslToHex(hue + 180, 0.85, 0.62)], 1.8, solidText)
  const solidSecond = visibleOn(
    solid,
    [light, secondary, accent].filter((c) => c !== pop),
    1.5,
    mix(solid, solidText, 0.4),
  )

  return [
    {
      id: 'site-1',
      styleId: SITE_LOOK_STYLES['site-1'],
      fonts,
      colors: {
        primary: lightAccent,
        secondary: lightAccent === primary ? secondary : primary,
        background: light,
        text: lightText,
        muted: mix(lightText, light, 0.4),
      },
    },
    {
      id: 'site-2',
      styleId: SITE_LOOK_STYLES['site-2'],
      fonts,
      colors: {
        primary: glow,
        secondary: darkSecond,
        background: dark,
        text: darkText,
        muted: mix(darkText, dark, 0.35),
      },
    },
    {
      id: 'site-3',
      styleId: SITE_LOOK_STYLES['site-3'],
      fonts,
      colors: {
        primary: pop,
        secondary: solidSecond,
        background: solid,
        text: solidText,
        muted: mix(solidText, solid, 0.3),
      },
    },
  ]
}

/**
 * Sopstveni izgled: primarna i sekundarna boja su naglasci, tercijalna je podloga slajda. Boja teksta
 * se bira sama da bude čitljiva na podlozi, a sporedni tekst je između teksta i podloge.
 */
export function customColors(primary: string, secondary: string, tertiary: string): DesignColors {
  const background = hex(tertiary, '#FFFFFF')
  const text = readable(background)
  return {
    primary: hex(primary, '#2563EB'),
    secondary: hex(secondary, '#0EA5E9'),
    background,
    text,
    muted: mix(text, background, 0.4),
  }
}
