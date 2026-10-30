import { DEFAULT_STYLE, STYLE_IDS } from './catalog'
import { PHOTO_STYLES } from './styles-photo'
import { TYPE_STYLES } from './styles-type'
import { VIVID_STYLES } from './styles-vivid'
import type { Slide, SlideKind, StyleDef } from './types'

export * from './catalog'
export * from './types'

const BY_ID = new Map<string, StyleDef>(
  [...TYPE_STYLES, ...PHOTO_STYLES, ...VIVID_STYLES].map((s) => [s.id, s]),
)

/** Svaki ID iz kataloga mora imati stil i obrnuto (proverava i test). */
export function catalogProblems(): string[] {
  const missing = STYLE_IDS.filter((id) => !BY_ID.has(id))
  const extra = [...BY_ID.keys()].filter((id) => !(STYLE_IDS as readonly string[]).includes(id))
  return [...missing.map((m) => `nema stila ${m}`), ...extra.map((e) => `stil van kataloga ${e}`)]
}

export function getStyle(id: string): StyleDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_STYLE)!
}

/** Da li stil na ovom slajdu crta fotografiju (da se ne preuzima nepotrebno). */
export function wantsPhoto(style: StyleDef, kind: SlideKind, index: number): boolean {
  if (style.photo === 'none') return false
  if (style.photo === 'cover') return index === 0 || kind === 'cover'
  return true
}

/** Satori nema emoji font: emoji iz teksta slajda se brišu (opis objave ih zadržava). */
export function cleanSlideText(slide: Slide): Slide {
  const strip = (v: string | null | undefined) =>
    v
      ? v
          .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
      : v
  return {
    ...slide,
    kicker: strip(slide.kicker),
    title: strip(slide.title) || slide.title,
    body: strip(slide.body),
    stat: strip(slide.stat),
    items: slide.items?.map((i) => strip(i) ?? '').filter(Boolean) ?? null,
  }
}
