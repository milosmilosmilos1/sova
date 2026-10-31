import type { StyleId } from './catalog'
import { contrast, hexToHsl, hslToHex, luminance, mix, readable } from './kit'
import type { DesignColors } from './types'

/**
 * Izgled brenda (D-123): Sova poseti sajt i od njegovih boja i fontova napravi tri svetle i tri
 * tamne teme, a sedmu sastavlja korisnik od tri boje i fonta. Izgled je stil, pet boja i font;
 * izabrani važi za sve objave (plan, Studio, tokovi). Sme u klijentski kod: birač računa boje
 * sopstvenog izgleda sam.
 */
export const LIGHT_LOOK_IDS = ['light-1', 'light-2', 'light-3'] as const
export const DARK_LOOK_IDS = ['dark-1', 'dark-2', 'dark-3'] as const
export const LOOK_IDS = [...LIGHT_LOOK_IDS, ...DARK_LOOK_IDS, 'custom'] as const
export type LookId = (typeof LOOK_IDS)[number]
export type SiteLookId = Exclude<LookId, 'custom'>

/** Oznake iz prve verzije (tri predloga), da sačuvan dizajn ne izgubi izbor. */
export const LEGACY_LOOK_IDS: Record<string, LookId> = {
  'site-1': 'light-1',
  'site-2': 'dark-1',
  'site-3': 'dark-2',
}

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

/**
 * Stil svake teme. Svetle: fotografija na vrhu, bela kartica sa trakama i meki prelivi na nijansi
 * boje brenda. Tamne: fotografija pod tamnim velom, odvažni oblici na tamnoj boji brenda i
 * fotografija na vrhu sa tamnim delom ispod.
 */
export const SITE_LOOK_STYLES: Record<SiteLookId, StyleId> = {
  'light-1': 'split',
  'light-2': 'sticker',
  'light-3': 'aurora',
  'dark-1': 'poster',
  'dark-2': 'blocks',
  'dark-3': 'split',
}

/** Stil za sopstveni izgled: klasična objava sa fotografijom u okviru, u kom se vide sve tri boje. */
export const CUSTOM_LOOK_STYLE: StyleId = 'framed'

const HEX = /^#[0-9a-fA-F]{6}$/
const hex = (value: string, fallback: string) => (HEX.test(value) ? value.toUpperCase() : fallback)

/** Prava boja, ne siva, skoro bela ili skoro crna (krem sa sajta nije naglasak). */
function chromatic(color: string): boolean {
  const [, s, l] = hexToHsl(color)
  return s >= 0.2 && l >= 0.12 && l <= 0.88
}

/** Prva prava boja koja se dovoljno vidi na podlozi; inače rezerva. */
function visibleOn(bg: string, candidates: string[], min: number, fallback: string): string {
  return candidates.find((c) => chromatic(c) && contrast(c, bg) >= min) ?? fallback
}

/** Boja brenda sa malo više života kad je sajt sivkast (logo i dugmad su često jedine boje). */
function lively(color: string, fallbackHue: number): string {
  const [h, s, l] = hexToHsl(color)
  if (s >= 0.18) return color
  return hslToHex(s >= 0.05 ? h : fallbackHue, 0.55, Math.min(0.5, Math.max(0.35, l)))
}

function look(
  id: SiteLookId,
  fonts: LookOption['fonts'],
  colors: Omit<DesignColors, 'muted'>,
  muted: number,
): LookOption {
  return {
    id,
    styleId: SITE_LOOK_STYLES[id],
    fonts,
    colors: { ...colors, muted: mix(colors.text, colors.background, muted) },
  }
}

/**
 * Šest tema sa sajta. Tekst je uvek čitljiv (4,5:1), a naglasak vidljiv na svojoj podlozi i uvek
 * prava boja brenda. Treća boja sa sajta (`accent`) ide poslednja: često je iz šablona sajta
 * (zelena „uspeh”, plavi link), a ne boja brenda.
 */
export function siteLooks(v: SiteVisual): LookOption[] {
  const primary = lively(hex(v.primary, '#2563EB'), 222)
  const secondary = hex(v.secondary, mix(primary, '#000000', 0.25))
  const accent = hex(v.accent, mix(primary, '#FFFFFF', 0.3))
  const fonts = { headings: v.headings || 'Inter', body: v.body || v.headings || 'Inter' }
  const [hue, sat] = hexToHsl(primary)
  const brandDark = hslToHex(hue, Math.max(sat, 0.5), 0.36)
  const brandGlow = hslToHex(hue, Math.max(sat, 0.55), 0.62)
  const complement = hslToHex(hue + 180, 0.8, 0.55)

  // svetle podloge: svetla sa sajta (ili bela), bela i nežna nijansa boje brenda
  const siteLight = HEX.test(v.light) && luminance(v.light) > 0.8 ? v.light.toUpperCase() : '#FFFFFF'
  const tint = hslToHex(hue, Math.min(0.75, Math.max(sat, 0.45)), 0.94)
  const ink = hex(v.dark, '#111827')
  // tamne podloge: tamna sa sajta (ili tamna nijansa brenda) i duboka boja brenda
  const siteDark =
    HEX.test(v.dark) && luminance(v.dark) < 0.04 ? v.dark.toUpperCase() : hslToHex(hue, 0.4, 0.09)
  const deep = luminance(primary) < 0.1 ? primary : hslToHex(hue, Math.max(sat, 0.5), 0.15)

  const onLight = (bg: string) => {
    const main = visibleOn(bg, [primary, secondary, accent], 2.2, brandDark)
    const second = visibleOn(
      bg,
      [secondary, primary, accent, complement].filter((c) => c !== main),
      1.6,
      mix(main, '#FFFFFF', 0.35),
    )
    return { primary: main, secondary: second, background: bg, text: readable(bg, ink) }
  }
  const onDark = (bg: string) => {
    const main = visibleOn(bg, [primary, secondary, brandGlow, accent], 3, brandGlow)
    const second = visibleOn(
      bg,
      [secondary, brandGlow, accent, complement].filter((c) => c !== main),
      2,
      mix(main, '#FFFFFF', 0.4),
    )
    return { primary: main, secondary: second, background: bg, text: readable(bg, '#F8FAFC') }
  }
  // tamna boja brenda je podloga, pa naglasak traži svetliju boju ili svetlu sa sajta
  const onDeep = () => {
    const text = readable(deep)
    const main = visibleOn(deep, [secondary, brandGlow, accent, complement], 1.8, siteLight)
    const second =
      [siteLight, secondary, accent].find((c) => c !== main && contrast(c, deep) >= 1.5) ??
      mix(deep, text, 0.4)
    return { primary: main, secondary: second, background: deep, text }
  }

  return [
    look('light-1', fonts, onLight(siteLight), 0.4),
    look('light-2', fonts, onLight('#FFFFFF'), 0.4),
    look('light-3', fonts, onLight(tint), 0.4),
    look('dark-1', fonts, onDark(siteDark), 0.35),
    look('dark-2', fonts, onDeep(), 0.3),
    look('dark-3', fonts, onDark(siteDark), 0.35),
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
