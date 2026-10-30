/**
 * Katalog stilova bez koda za crtanje (D-108): sme u klijentski kod (birač, podešavanja).
 * Redosled je redosled u biraču: prvo stilovi koji rade i bez fotografije. ID-jevi su trajni.
 */
export const STYLE_IDS = [
  'headline',
  'bold',
  'editorial',
  'cover',
  'poster',
  'cards',
  'linen',
  'social',
  'prism',
  'popcard',
  'note',
  'snap',
  'meme',
  'film',
  'pamphlet',
  'quote',
  'stat',
  'list',
  'duotone',
  'framed',
  'event',
  'mono',
] as const
export type StyleId = (typeof STYLE_IDS)[number]
export const DEFAULT_STYLE: StyleId = 'headline'

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && (STYLE_IDS as readonly string[]).includes(value)
}

/** Stilovi kojima je fotografija deo izgleda (bez nje padaju na preliv u bojama brenda). */
export const PHOTO_STYLE_IDS: ReadonlySet<StyleId> = new Set([
  'editorial',
  'cover',
  'poster',
  'social',
  'snap',
  'meme',
  'film',
  'duotone',
  'framed',
  'event',
])

/** Izvor fotografija za dizajn: bez, besplatne (Unsplash pa Pexels) ili galerija brenda. Bez AI-ja (D-108). */
export const PHOTO_SOURCES = ['none', 'stock', 'gallery'] as const
export type PhotoSource = (typeof PHOTO_SOURCES)[number]

/** Format objave i karusela; priča je uvek 9:16. */
export const POST_SIZES = ['portrait', 'square'] as const
export type PostSize = (typeof POST_SIZES)[number]

export const SLIDES_MIN = 3
export const SLIDES_MAX = 10
export const SLIDES_DEFAULT = 5
