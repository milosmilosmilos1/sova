import { cleanSlideText, getStyle } from './index'
import {
  DESIGN_SIZES,
  type DesignColors,
  type DesignContext,
  type DesignFormat,
  type Slide,
  type ThemeVariant,
} from './types'
import { variantColors } from './variants'

/**
 * Okvir fotografije na slajdu (D-169): širina i visina u pikselima kako ih stil crta. Po njemu Sova
 * bira oblik fotografije (vodoravna za široku traku, uspravna za visok okvir, kvadratna za kvadrat)
 * i proverava da glavni predmet može ceo da stane, umesto da ga isečak odseče.
 */
export interface PhotoSlot {
  width: number
  height: number
}

/** Oznaka fotografije u stablu slajda: slika se ne učitava, samo se čita njen okvir. */
const PROBE = 'data:image/png;base64,c292YS1mb3RvLW9rdmly'

const px = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const m = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(v)
    if (m) return Number(m[1])
  }
  return null
}

/** Najveći okvir slike sa izvorom `src` u stablu (stil može da je crta i više puta, npr. kao pozadinu). */
export function findPhotoSlot(tree: unknown, src: string): PhotoSlot | null {
  let best: PhotoSlot | null = null
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
    if (n.type === 'img' && n.props.src === src) {
      const width = px(n.props.style?.width)
      const height = px(n.props.style?.height)
      if (width && height && width > 0 && height > 0 && (!best || width * height > best.width * best.height))
        best = { width, height }
    }
    visit(n.props.children)
  }
  visit(tree)
  return best
}

/** Okvir fotografije na slajdu stila; `null` kad slajd nema fotografiju ili okvir nije u pikselima. */
export function photoSlot(input: {
  styleId: string
  slide: Slide
  format: DesignFormat
  colors: DesignColors
  index: number
  total: number
  variant?: ThemeVariant
}): PhotoSlot | null {
  const variant = input.variant ?? 0
  const ctx: DesignContext = {
    format: input.format,
    size: DESIGN_SIZES[input.format],
    colors: variantColors(input.colors, variant),
    fonts: { headings: 'Inter', body: 'Inter' },
    brandName: '',
    handle: null,
    logo: null,
    photo: PROBE,
    index: input.index,
    total: input.total,
    variant,
    video: false,
  }
  try {
    return findPhotoSlot(getStyle(input.styleId).render(cleanSlideText(input.slide), ctx), PROBE)
  } catch {
    return null
  }
}
