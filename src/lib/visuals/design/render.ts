import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

import { BUNDLED_FAMILY, loadFonts } from '../fonts'
import { toDataUri } from '../render'
import { fontWidth } from './font-choices'
import { cleanSlideText, getStyle } from './index'
import { mix, withWidthScale } from './kit'
import {
  DESIGN_SIZES,
  type DesignColors,
  type DesignContext,
  type DesignFormat,
  type FontChoice,
  type Slide,
  type StyleDef,
} from './types'

/**
 * Render slajda (D-108): stil → Satori stablo → SVG → PNG (resvg) → JPEG. Fontovi stila se
 * učitavaju sa Google Fonts-a, a bez mreže (testovi) sve pada na ugrađeni Inter.
 */
export interface SlideRenderInput {
  styleId: string
  slide: Slide
  format: DesignFormat
  colors: DesignColors
  brandFonts: { headings: string; body: string }
  /** font je brend izabrao sam (D-123): važi u svakom stilu osim onih čiji je font deo izgleda */
  lockFonts?: boolean
  brandName: string
  handle: string | null
  logo: string | null
  photo: string | null
  index: number
  total: number
  /** širina izlaza; pregled u biraču je manji od pune veličine */
  outputWidth?: number
  format_out?: 'jpeg' | 'png'
}

export interface SlideRenderResult {
  bytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

function family(choice: FontChoice, brand: string): string {
  return choice === 'brand' ? brand || BUNDLED_FAMILY : choice
}

export async function renderSlide(input: SlideRenderInput): Promise<SlideRenderResult> {
  const style = getStyle(input.styleId)
  const size = DESIGN_SIZES[input.format]
  const lock = Boolean(input.lockFonts && !style.ownFonts)
  const want = {
    headings: lock ? input.brandFonts.headings : family(style.fonts.headings, input.brandFonts.headings),
    body: lock ? input.brandFonts.body : family(style.fonts.body, input.brandFonts.body),
  }
  const loaded = await loadFonts([want.headings, want.body])
  const fonts = {
    headings: loaded.available.has(want.headings) ? want.headings : BUNDLED_FAMILY,
    body: loaded.available.has(want.body) ? want.body : BUNDLED_FAMILY,
  }
  const ctx: DesignContext = {
    format: input.format,
    size,
    colors: input.colors,
    fonts,
    brandName: input.brandName,
    handle: input.handle,
    logo: input.logo,
    photo: input.photo,
    index: input.index,
    total: input.total,
  }
  // stil sa sopstvenim fontom (npr. uski Oswald) je veličinu naslova podesio za taj font
  const designed = style.fonts.headings
  const scale =
    lock && designed !== 'brand' && fonts.headings !== designed
      ? Math.min(1.6, Math.max(0.8, fontWidth(fonts.headings) / fontWidth(designed)))
      : 1
  const tree = withWidthScale(scale, () => style.render(cleanSlideText(input.slide), ctx))
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: size.width,
    height: size.height,
    fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  })
  const outWidth = input.outputWidth ?? size.width
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: outWidth }, font: { loadSystemFonts: false } })
    .render()
    .asPng()
  const out = input.format_out ?? 'jpeg'
  const image = sharp(Buffer.from(png))
  const bytes =
    out === 'png' ? await image.png().toBuffer() : await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  return {
    bytes,
    mimeType: out === 'png' ? 'image/png' : 'image/jpeg',
    width: outWidth,
    height: Math.round((size.height * outWidth) / size.width),
  }
}

/**
 * Fotografija za stil: smanjena (najviše 1600 px), po potrebi crno-bela ili obojena bojom brenda,
 * pa kao data URI (Satori ne preuzima mrežu).
 */
export async function preparePhoto(bytes: Buffer, style: StyleDef, colors: DesignColors): Promise<string> {
  let image = sharp(bytes, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
  if (style.photoTreatment === 'grayscale') image = image.grayscale().linear(1.15, -12)
  if (style.photoTreatment === 'duotone') {
    const tint = mix(colors.primary, '#ffffff', 0.25)
    const n = Number.parseInt(tint.slice(1), 16)
    image = image.grayscale().tint({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 })
  }
  const out = await image.jpeg({ quality: 82 }).toBuffer()
  return toDataUri(out, 'image/jpeg')
}
