import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

import { BUNDLED_FAMILY, loadFonts, type FontEntry } from './fonts'
import { buildTemplate, type SatoriNode, type TemplateId, type TemplateInput } from './templates'

/**
 * Render šablona: Satori (HTML/CSS podskup → SVG) → resvg (SVG → PNG) → sharp (JPEG ili PNG).
 * Radi bez sistemskih fontova (Vercel), slike su data URI.
 */
export interface RenderResult {
  bytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
  svgBytes: number
  fontsUsed: { headings: string; body: string }
}

export function toDataUri(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

/** Sliku pre renderа smanjimo (max 1600 px, JPEG) da SVG i memorija ostanu mali. */
export async function prepareImageForTemplate(bytes: Buffer, maxSide = 1600): Promise<string> {
  const out = await sharp(bytes, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
  return toDataUri(out, 'image/jpeg')
}

export async function prepareLogoForTemplate(bytes: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'image/svg+xml') {
    const png = await sharp(bytes, { density: 192 }).resize({ height: 240, fit: 'inside' }).png().toBuffer()
    return toDataUri(png, 'image/png')
  }
  const png = await sharp(bytes)
    .resize({ height: 240, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  return toDataUri(png, 'image/png')
}

export async function renderTemplate(options: {
  template: TemplateId
  input: TemplateInput
  format?: 'jpeg' | 'png'
  fonts?: FontEntry[]
}): Promise<RenderResult> {
  const wantHeadings = options.input.fonts.headings
  const wantBody = options.input.fonts.body
  const loaded = options.fonts
    ? { fonts: options.fonts, available: new Set(options.fonts.map((f) => f.name)) }
    : await loadFonts([wantHeadings, wantBody])
  const fonts = {
    headings: loaded.available.has(wantHeadings) ? wantHeadings : BUNDLED_FAMILY,
    body: loaded.available.has(wantBody) ? wantBody : BUNDLED_FAMILY,
  }
  const tree: SatoriNode = buildTemplate(options.template, { ...options.input, fonts })
  const { width, height } = options.input.size
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
  const png = resvg.render().asPng()
  const format = options.format ?? 'jpeg'
  const image = sharp(Buffer.from(png))
  const bytes =
    format === 'png'
      ? await image.png().toBuffer()
      : await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  return {
    bytes,
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
    width,
    height,
    svgBytes: svg.length,
    fontsUsed: fonts,
  }
}
