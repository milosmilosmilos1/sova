import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

import {
  TEMPLATE_SIZES,
  type TemplateFormat,
  type TemplateFrame,
  type TemplateLayer,
} from '@/lib/figma/template'

import { BUNDLED_FAMILY, loadFonts } from '../fonts'
import { fontWidth } from './font-choices'
import { cleanSlideText } from './index'
import { fit, pad2 } from './kit'
import type { BrandLogo, Slide } from './types'

/**
 * Slajd po Figma šablonu (D-162): slika grupe `#pozadina` na svom mestu, preko nje fotografija u
 * okviru `#foto`, logo u `#logo` i tekst slajda u slojevima `#naslov`, `#tekst`… u fontu, boji i
 * poravnanju iz Figme. Duži tekst se smanjuje dok ne stane u okvir sloja (najviše na pola veličine).
 */
export interface TemplateSlideInput {
  frame: TemplateFrame
  format: TemplateFormat
  /** slika grupe `#pozadina` (data URI) */
  background: string
  slide: Slide
  index: number
  total: number
  brandName: string
  handle: string | null
  logo: BrandLogo | null
  photo: string | null
  outputWidth?: number
  format_out?: 'jpeg' | 'png'
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; src?: string } }

const node = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
  extra: Record<string, unknown> = {},
): Node => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }), ...extra },
})

function textFor(layer: TemplateLayer, input: TemplateSlideInput, slide: Slide): string | null {
  switch (layer.role) {
    case 'title':
      return slide.title || null
    case 'body':
      return slide.body || (slide.items?.length ? slide.items.map((i) => `• ${i}`).join('\n') : null)
    case 'kicker':
      return slide.kicker || null
    case 'number':
      return slide.kind === 'point' ? pad2(Math.max(1, input.index)) : null
    case 'handle':
      return input.handle
        ? input.handle.startsWith('@')
          ? input.handle
          : `@${input.handle}`
        : input.brandName
    case 'counter':
      return input.total > 1 ? `${input.index + 1}/${input.total}` : null
    default:
      return null
  }
}

const JUSTIFY = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const
const ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

export async function renderTemplateSlide(input: TemplateSlideInput): Promise<{
  bytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
}> {
  const size = TEMPLATE_SIZES[input.format]
  const slide = cleanSlideText(input.slide)
  const families = [...new Set(input.frame.layers.map((l) => l.font).filter((f): f is string => Boolean(f)))]
  const loaded = await loadFonts(families)
  const familyOf = (f: string | null) => (f && loaded.available.has(f) ? f : BUNDLED_FAMILY)

  const children: Node[] = [
    node(
      'img',
      {
        position: 'absolute',
        left: input.frame.background.x,
        top: input.frame.background.y,
        width: input.frame.background.w,
        height: input.frame.background.h,
      },
      undefined,
      { src: input.background },
    ),
  ]
  for (const layer of input.frame.layers) {
    const place = { position: 'absolute', left: layer.x, top: layer.y, width: layer.w, height: layer.h }
    if (layer.role === 'photo') {
      if (input.photo)
        children.push(
          node('img', { ...place, objectFit: 'cover', borderRadius: layer.radius ?? 0 }, undefined, {
            src: input.photo,
          }),
        )
      continue
    }
    if (layer.role === 'logo') {
      if (input.logo)
        children.push(node('img', { ...place, objectFit: 'contain' }, undefined, { src: input.logo.src }))
      continue
    }
    const text = textFor(layer, input, slide)
    if (!text) continue
    const family = familyOf(layer.font)
    const designed = layer.size ?? 48
    const lineRatio = layer.lineHeight && layer.size ? layer.lineHeight / layer.size : 1.2
    const shown = layer.upper ? text.toUpperCase() : text
    const fontSize = fit(shown, {
      max: designed,
      min: Math.max(12, designed * 0.5),
      width: layer.w,
      height: layer.h,
      lineHeight: lineRatio,
      charWidth: fontWidth(family) * (layer.upper ? 1.15 : 1),
    })
    children.push(
      node(
        'div',
        {
          ...place,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: JUSTIFY[layer.valign ?? 'top'],
          alignItems: ALIGN[layer.align ?? 'left'],
          textAlign: layer.align ?? 'left',
          fontFamily: family,
          fontWeight: layer.weight && layer.weight >= 600 ? 700 : 400,
          fontSize,
          lineHeight: lineRatio,
          letterSpacing: layer.letterSpacing ?? 0,
          color: layer.color ?? '#111111',
          whiteSpace: 'pre-wrap',
        },
        shown,
      ),
    )
  }
  const tree = node(
    'div',
    {
      display: 'flex',
      position: 'relative',
      width: size.width,
      height: size.height,
      backgroundColor: input.frame.fill,
    },
    children,
  )
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
