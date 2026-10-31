import { cleanSlideText, getStyle } from './index'
import { DESIGN_SIZES, type DesignContext, type DesignFormat, type Slide } from './types'

/** Delovi slajda koje korisnik menja pored naslova (D-129). */
export type SlideField = 'kicker' | 'body' | 'stat' | 'items'

const FIELDS: SlideField[] = ['kicker', 'body', 'stat', 'items']

/** Primer teksta za polje koje je prazno: da li bi ga stil nacrtao da ga korisnik upiše. */
const SAMPLE: Record<SlideField, string | string[]> = {
  kicker: 'Oznaka',
  body: 'Kratak tekst slajda.',
  stat: '3x',
  items: ['Prva stavka', 'Druga stavka'],
}

const has = (slide: Slide, field: SlideField) =>
  field === 'items' ? Boolean(slide.items?.length) : Boolean(slide[field])

/**
 * Delovi koje stil na ovom slajdu zaista crta: raspored (Satori stablo, bez crtanja slike) sa delom i
 * bez njega. Stil „Poster” na primer ne crta nabrajanje, pa obrazac to polje ne pokazuje.
 */
export function drawnFields(input: {
  styleId: string
  slide: Slide
  format: DesignFormat
  index: number
  total: number
  /** da li slajd ima fotografiju (stilovi sa fotografijom crtaju drugačije bez nje) */
  photo: boolean
}): SlideField[] {
  const style = getStyle(input.styleId)
  const ctx: DesignContext = {
    format: input.format,
    size: DESIGN_SIZES[input.format],
    colors: {
      primary: '#2563EB',
      secondary: '#0EA5E9',
      background: '#FFFFFF',
      text: '#111827',
      muted: '#6B7280',
    },
    fonts: { headings: 'Inter', body: 'Inter' },
    brandName: 'Sova',
    handle: '@sova',
    logo: null,
    photo: input.photo ? 'data:image/jpeg;base64,' : null,
    index: input.index,
    total: input.total,
  }
  const tree = (slide: Slide) => JSON.stringify(style.render(cleanSlideText(slide), ctx))
  return FIELDS.filter((field) => {
    const filled = has(input.slide, field) ? input.slide : { ...input.slide, [field]: SAMPLE[field] }
    return tree(filled) !== tree({ ...input.slide, [field]: null })
  })
}

/**
 * Polja u obrascu: ono što stil crta, a od toga natpis iznad naslova kad ga slajd ima ili je prvi,
 * tekst uvek, a istaknut broj i nabrajanje samo kad ih slajd već ima.
 */
export function formFields(slide: Slide, index: number, drawn: SlideField[]): SlideField[] {
  return drawn.filter((field) =>
    field === 'body' ? true : field === 'kicker' ? has(slide, field) || index === 0 : has(slide, field),
  )
}
