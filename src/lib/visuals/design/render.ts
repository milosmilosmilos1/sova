import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

import { BUNDLED_FAMILY, loadFonts } from '../fonts'
import { centeredPosition, objectPosition, type Focus, type SubjectBox } from '../focus'
import { toDataUri } from '../render'
import { fontWidth } from './font-choices'
import { cleanSlideText, getStyle } from './index'
import { mix, withWidthScale } from './kit'
import { matteFromKeys } from './matte'
import { tightenShadowFilters } from './shadows'
import {
  type BrandLogo,
  DESIGN_SIZES,
  type DesignColors,
  type DesignContext,
  type DesignFormat,
  type FontChoice,
  type Slide,
  type StyleDef,
  type ThemeVariant,
} from './types'
import { variantColors } from './variants'

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
  logo: BrandLogo | null
  photo: string | null
  /** sredina glavnog predmeta na fotografiji (D-167); bez nje fotografija se seče po sredini */
  photoFocus?: Focus | null
  /** širina / visina fotografije (D-169): sa njom se predmet centrira u okviru, a ne samo drži u kadru */
  photoAspect?: number | null
  /** okvir glavnog predmeta (D-169): predmet viši od okvira zadržava vrh (glavu) */
  photoBox?: SubjectBox | null
  index: number
  total: number
  /** ritam teme (D-132); bez nje osnovni raspored */
  variant?: ThemeVariant
  /** kadar videa (D-135): snimak preko celog kadra */
  video?: boolean
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

/**
 * Fotografija ide ka glavnom predmetu (D-167): svaki `img` sa fotografijom koji stil seče
 * (`objectFit: cover`) dobija `objectPosition` po fokusu, pa predmet ostaje u okviru bilo kog
 * oblika (traka, krug, ceo kadar). Kad je poznat odnos stranica fotografije, a okvir je u pikselima,
 * predmet se centrira u okviru (D-169). Stil koji je sam zadao položaj ostaje kakav jeste.
 */
export function focusPhotoNodes(
  tree: unknown,
  photo: string,
  focus: Focus,
  photoAspect?: number | null,
  box?: SubjectBox | null,
): void {
  const px = (v: unknown) =>
    typeof v === 'number'
      ? v
      : typeof v === 'string' && /^\s*\d+(\.\d+)?px\s*$/.test(v)
        ? parseFloat(v)
        : null
  const positionFor = (style: Record<string, unknown>) => {
    const w = px(style.width)
    const h = px(style.height)
    return photoAspect && w && h ? centeredPosition(focus, photoAspect, w / h, box) : objectPosition(focus)
  }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const n = node as {
      type?: unknown
      props?: { src?: unknown; style?: Record<string, unknown>; children?: unknown }
    }
    if (!n.props) return
    const style = n.props.style
    if (n.type === 'img' && n.props.src === photo && style?.objectFit === 'cover' && !style.objectPosition)
      n.props.style = { ...style, objectPosition: positionFor(style) }
    visit(n.props.children)
  }
  visit(tree)
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
  const variant = input.variant ?? 0
  const ctx: DesignContext = {
    format: input.format,
    size,
    colors: variantColors(input.colors, variant),
    fonts,
    brandName: input.brandName,
    handle: input.handle,
    logo: input.logo,
    photo: input.photo,
    index: input.index,
    total: input.total,
    variant,
    video: input.video ?? false,
  }
  // stil sa sopstvenim fontom (npr. uski Oswald) je veličinu naslova podesio za taj font
  const designed = style.fonts.headings
  const scale =
    lock && designed !== 'brand' && fonts.headings !== designed
      ? Math.min(1.6, Math.max(0.8, fontWidth(fonts.headings) / fontWidth(designed)))
      : 1
  const tree = withWidthScale(scale, () => style.render(cleanSlideText(input.slide), ctx))
  if (input.photo && input.photoFocus)
    focusPhotoNodes(tree, input.photo, input.photoFocus, input.photoAspect, input.photoBox)
  const drawn = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: size.width,
    height: size.height,
    fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  })
  // senke: resvg zamućuje samo oko senke, ne površinu triput veću od slajda
  const svg = tightenShadowFilters(drawn, size.width, size.height)
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

/** Jednobojne „fotografije” za sloj videa (D-128): crna i bela, bez obrade stila. */
let keyPhotos: Promise<[string, string]> | null = null
function keys(): Promise<[string, string]> {
  const solid = (v: number) =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: { r: v, g: v, b: v } } })
      .png()
      .toBuffer()
      .then((b) => toDataUri(b, 'image/png'))
  keyPhotos ??= Promise.all([solid(0), solid(255)])
  return keyPhotos
}

/**
 * Sloj teksta za video u temi (D-128): isti slajd sa crnom i sa belom fotografijom, pa PNG sa
 * providnošću tamo gde stil crta fotografiju. Pregledač ispod njega pušta snimak.
 */
export async function renderOverlay(
  input: Omit<SlideRenderInput, 'photo' | 'format_out'>,
): Promise<SlideRenderResult> {
  const [black, white] = await keys()
  const [onBlack, onWhite] = await Promise.all([
    renderSlide({ ...input, photo: black, format_out: 'png' }),
    renderSlide({ ...input, photo: white, format_out: 'png' }),
  ])
  const a = await sharp(onBlack.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const b = await sharp(onWhite.bytes).ensureAlpha().raw().toBuffer()
  const rgba = matteFromKeys(a.data, b)
  const bytes = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: a.info.width, height: a.info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer()
  return { bytes, mimeType: 'image/png', width: a.info.width, height: a.info.height }
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
