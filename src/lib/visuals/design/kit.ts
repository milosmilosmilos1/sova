import type { SatoriNode } from '../templates'

import type { DesignContext, Slide } from './types'

/** Alati koje dele stilovi: elementi, veličina teksta, boje i ponovljeni delovi slajda. */
export type Style = Record<string, string | number>
type Child = SatoriNode | string | null | undefined | false

export function el(
  type: string,
  style: Style,
  children?: Child | Child[],
  extra: Record<string, unknown> = {},
) {
  const list = Array.isArray(children)
    ? children.filter((c): c is SatoriNode | string => Boolean(c))
    : children
  return {
    type,
    props: { ...extra, style, children: list === false || list === null ? undefined : list },
  } as SatoriNode
}

/** Flex kontejner (Satori traži display: flex čim element ima više dece). */
export const box = (style: Style, children?: Child | Child[]) =>
  el('div', { display: 'flex', ...style }, children)
export const col = (style: Style, children?: Child | Child[]) =>
  el('div', { display: 'flex', flexDirection: 'column', ...style }, children)
export const text = (style: Style, value: string | null | undefined) =>
  value ? el('div', { display: 'flex', ...style }, value) : null
export const img = (src: string, style: Style) => el('img', style, undefined, { src })

export const px = (n: number) => `${Math.round(n)}px`

/** Razmera prema širini 1080 (priča i kvadrat imaju istu širinu). */
export const sc = (ctx: DesignContext) => ctx.size.width / 1080

let widthScale = 1

/**
 * Crtanje stila kad font brenda zameni font za koji je stil podesio širinu slova (D-123): `fit`
 * tada množi procenu širine. Crtanje stabla je sinhrono, pa podešavanje važi samo za taj poziv.
 */
export function withWidthScale<T>(scale: number, draw: () => T): T {
  widthScale = scale
  try {
    return draw()
  } finally {
    widthScale = 1
  }
}

/**
 * Najveća veličina fonta pri kojoj tekst staje u zadati prostor. Širina slova je procena po vrsti
 * fonta (uži za kondenzovan, širi za mono), a broj redova se računa po rečima.
 */
export function fit(
  value: string,
  opts: { max: number; min: number; width: number; height: number; lineHeight?: number; charWidth?: number },
): number {
  const lineHeight = opts.lineHeight ?? 1.1
  const charWidth = (opts.charWidth ?? 0.56) * widthScale
  const words = value.split(/\s+/).filter(Boolean)
  for (let size = opts.max; size > opts.min; size -= 2) {
    const perLine = Math.max(1, Math.floor(opts.width / (size * charWidth)))
    let lines = 1
    let used = 0
    for (const w of words) {
      const len = w.length
      if (used === 0) used = len
      else if (used + 1 + len <= perLine) used += 1 + len
      else {
        lines += 1
        used = len
      }
      if (len > perLine) lines += Math.floor(len / perLine)
    }
    if (lines * size * lineHeight <= opts.height) return size
  }
  return opts.min
}

// boje -----------------------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = Number.parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [17, 17, 17]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Boja teksta na podlozi: željena ako je čitljiva (4,5:1), inače bela ili skoro crna. */
export function readable(bg: string, preferred?: string): string {
  if (preferred && contrast(bg, preferred) >= 4.5) return preferred
  return contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111'
}

/** Mešanje dve boje (t = 0 prva, 1 druga). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export const isDark = (hex: string) => luminance(hex) < 0.35

/** Boja u HSL: nijansa 0–360, zasićenost i svetlina 0–1 (za šarene palete iz boje brenda). */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360
  if (s === 0) return toHex(l * 255, l * 255, l * 255)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return toHex(channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255)
}

// ponovljeni delovi -----------------------------------------------------------------------------

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** „01 / 05” u uglu karusela; jedna objava nema brojač. */
export function counterText(ctx: DesignContext): string | null {
  return ctx.total > 1 ? `${pad2(ctx.index + 1)} / ${pad2(ctx.total)}` : null
}

export function handleText(ctx: DesignContext): string {
  return ctx.handle ? (ctx.handle.startsWith('@') ? ctx.handle : `@${ctx.handle}`) : ctx.brandName
}

/** Logo brenda ako postoji, inače ime brenda slovima. */
export function brandMark(ctx: DesignContext, height: number, color: string): SatoriNode {
  if (ctx.logo) return img(ctx.logo, { height: px(height), objectFit: 'contain', maxWidth: px(height * 4) })
  return el(
    'div',
    { display: 'flex', fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(height * 0.62), color },
    ctx.brandName,
  )
}

/** Gornja traka: nalog levo, brojač desno. */
export function topBar(ctx: DesignContext, color: string, opts: { font?: string; size?: number } = {}) {
  const s = sc(ctx)
  const size = (opts.size ?? 26) * s
  return box(
    {
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: opts.font ?? ctx.fonts.body,
      fontSize: px(size),
      color,
      letterSpacing: '0.5px',
    },
    [text({}, handleText(ctx)), text({}, counterText(ctx))],
  )
}

/** Strelica „prevuci” na naslovnom slajdu karusela. */
export function swipeHint(ctx: DesignContext, color: string, label = '→'): SatoriNode | null {
  if (ctx.total <= 1 || ctx.index !== 0) return null
  const s = sc(ctx)
  return text({ fontFamily: ctx.fonts.body, fontSize: px(44 * s), color, fontWeight: 700 }, label)
}

/** Prostor za tekst u zavisnosti od formata (priča je viša, kvadrat niži). */
export function textArea(ctx: DesignContext, share: number) {
  return { width: ctx.size.width, height: ctx.size.height * share }
}

/** Broj slajda sadržaja (naslovni je 0): prvi „point” je 01. */
export function pointNumber(ctx: DesignContext): string {
  return pad2(Math.max(1, ctx.index))
}

/** Lista stavki: iz slide.items ili rečenice tela. */
export function listItems(slide: Slide): string[] {
  if (slide.items?.length) return slide.items.slice(0, 5)
  if (!slide.body) return []
  return slide.body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4)
}

/** Istaknut broj: slide.stat ili prvi broj iz naslova, sa jedinicom kad je ima (%, x, h, min, dana). */
export function statValue(slide: Slide): string | null {
  if (slide.stat?.trim()) return slide.stat.trim()
  const m = /\d+(?:[.,]\d+)?(?:\s?(?:%|x|×|h|min|dana|days|днів)(?![\p{L}]))?/iu.exec(slide.title)
  return m ? m[0].trim() : null
}

/** Ikonice kao SVG putanje (Satori crta svg, a fontovi nemaju sve simbole). */
export const ICONS = {
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  comment: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  send: 'M14.54 21.69a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11zM21.85 2.15 10.91 13.09',
  bookmark: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  check: 'M20 6 9 17l-5-5',
  arrow: 'M5 12h14M12 5l7 7-7 7',
} as const

export function icon(name: keyof typeof ICONS, size: number, color: string, strokeWidth = 2): SatoriNode {
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { display: 'flex' },
      children: { type: 'path', props: { d: ICONS[name] } },
    },
  } as unknown as SatoriNode
}

/**
 * Apsolutno pozicionirani elementi (pozadinska fotografija, ukrasi) se crtaju posle običnih, pa bi
 * prekrili tekst. Sadržaj dobija position: relative i crta se redom kojim je napisan, preko pozadine.
 */
export function layered(children: unknown[]): unknown[] {
  return children.map((child) => {
    if (!child || typeof child !== 'object') return child
    const node = child as SatoriNode
    const style = node.props.style ?? {}
    if (style.position === 'absolute') return node
    return { ...node, props: { ...node.props, style: { ...style, position: 'relative' } } }
  })
}
