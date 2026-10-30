import type { SatoriNode } from '../templates'

/**
 * Stilovi objava (D-108): isti stil važi za objavu, karusel i priču. Slajd nosi tekst koji piše
 * Gemini, a stil odlučuje kako izgleda. Sve dimenzije su za širinu 1080 px.
 */
export type DesignFormat = 'square' | 'portrait' | 'story'
export const DESIGN_FORMATS: DesignFormat[] = ['portrait', 'square', 'story']
export const DESIGN_SIZES: Record<DesignFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

export type SlideKind = 'cover' | 'point' | 'cta'

export interface Slide {
  kind: SlideKind
  /** mala oznaka iznad naslova (serija, kategorija, datum i mesto za događaj) */
  kicker?: string | null
  title: string
  body?: string | null
  /** istaknut broj za stil „Statistika” (npr. „73 %”) */
  stat?: string | null
  /** stavke za stil „Lista” */
  items?: string[] | null
}

export interface DesignColors {
  primary: string
  secondary: string
  background: string
  text: string
  muted: string
}

/** Porodica fonta: 'brand' znači font brenda iz profila, inače ime Google fonta. */
export type FontChoice =
  'brand' | 'Inter' | 'Playfair Display' | 'Oswald' | 'JetBrains Mono' | 'Caveat' | 'Montserrat'

export interface DesignContext {
  format: DesignFormat
  size: { width: number; height: number }
  colors: DesignColors
  fonts: { headings: string; body: string }
  brandName: string
  /** „@nalog” ispod slajda; bez naloga ide ime brenda */
  handle: string | null
  logo: string | null
  /** fotografija za ovaj slajd (data URI), već pripremljena za stil */
  photo: string | null
  index: number
  total: number
}

export type PhotoUse = 'none' | 'optional' | 'cover' | 'all'

export interface StyleDef {
  id: string
  /** kategorija u biraču: tipografski ili sa fotografijom */
  group: 'type' | 'photo'
  fonts: { headings: FontChoice; body: FontChoice }
  /** gde stil koristi fotografiju: nigde, svuda ako postoji, samo na naslovnom slajdu, na svim */
  photo: PhotoUse
  /** obrada fotografije pre rendera (sharp), npr. crno-belo za duoton i pamflet */
  photoTreatment?: 'grayscale' | 'duotone' | 'none'
  render: (slide: Slide, ctx: DesignContext) => SatoriNode
}
