import { hexToHsl } from '@/lib/visuals/design/kit'

/**
 * Brend iz Figme (D-161): iz okvira koje je korisnik izabrao Sova čita boje (po površini oblika i
 * dužini teksta), fontove (naslov je najveći tekst, telo tekst koga ima najviše među manjima) i sloj
 * čije ime sadrži „logo”. Izlaz je predlog za sopstvenu temu: dve boje brenda, podloga i font.
 */
export interface FigmaPaint {
  type: string
  visible?: boolean
  opacity?: number
  color?: { r: number; g: number; b: number; a?: number }
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]
  fills?: FigmaPaint[] | unknown
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null
  style?: {
    fontFamily?: string
    fontWeight?: number
    fontSize?: number
    lineHeightPx?: number
    letterSpacing?: number
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
    textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
    textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED'
  }
  characters?: string
  cornerRadius?: number
}

export interface FigmaBrand {
  primary: string | null
  secondary: string | null
  background: string
  text: string | null
  fonts: { headings: string | null; body: string | null }
  logoNodeId: string | null
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()

function solid(node: FigmaNode): string | null {
  if (!Array.isArray(node.fills)) return null
  const paint = (node.fills as FigmaPaint[]).find(
    (p) => p.type === 'SOLID' && p.visible !== false && (p.opacity ?? 1) > 0.5 && p.color,
  )
  if (!paint?.color || (paint.color.a ?? 1) < 0.5) return null
  return `#${hex2(paint.color.r)}${hex2(paint.color.g)}${hex2(paint.color.b)}`
}

/** Boja brenda: zasićena, ni skoro bela ni skoro crna (siva i krem nisu boja brenda). */
function brandy(hex: string): boolean {
  const [, s, l] = hexToHsl(hex)
  return s >= 0.25 && l >= 0.12 && l <= 0.9
}

function distance(a: string, b: string): number {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [n(a), n(b)]
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!)
}

const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

export function figmaBrand(roots: FigmaNode[]): FigmaBrand {
  const shapes = new Map<string, number>()
  const texts = new Map<string, number>()
  const backgrounds = new Map<string, number>()
  const sizes: Array<{ family: string; size: number; chars: number }> = []
  let logoNodeId: string | null = null

  const walk = (node: FigmaNode, depth: number) => {
    if (node.visible === false) return
    if (!logoNodeId && depth > 0 && /logo/i.test(node.name)) logoNodeId = node.id
    const color = solid(node)
    const box = node.absoluteBoundingBox
    const area = box ? box.width * box.height : 0
    if (color) {
      if (depth === 0) add(backgrounds, color, area || 1)
      else if (node.type === 'TEXT') add(texts, color, node.characters?.length ?? 1)
      else add(shapes, color, area)
    }
    if (node.type === 'TEXT' && node.style?.fontFamily && node.style.fontSize) {
      sizes.push({
        family: node.style.fontFamily,
        size: node.style.fontSize,
        chars: node.characters?.length ?? 1,
      })
    }
    for (const child of node.children ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  // boja brenda: oblici po površini i tekst po dužini, svaki deo sveden na udeo
  const weight = new Map<string, number>()
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0) || 1
  for (const [c, v] of shapes) add(weight, c, v / total(shapes))
  for (const [c, v] of texts) add(weight, c, (0.6 * v) / total(texts))
  for (const [c, v] of backgrounds) add(weight, c, (0.8 * v) / total(backgrounds))
  const colorful = top(weight).filter(brandy)
  const primary = colorful[0] ?? null
  const secondary = colorful.find((c) => primary && distance(c, primary) > 60) ?? null

  // naslov: najveći tekst; telo: tekst sa najviše slova među onima do srednje veličine
  const bySize = [...sizes].sort((a, b) => b.size - a.size)
  const headings = bySize[0]?.family ?? null
  const median = bySize[Math.floor(bySize.length / 2)]?.size ?? 0
  const bodyChars = new Map<string, number>()
  for (const s of sizes) if (s.size <= median) add(bodyChars, s.family, s.chars)
  const body = top(bodyChars)[0] ?? headings

  return {
    primary,
    secondary,
    background: top(backgrounds)[0] ?? '#FFFFFF',
    text: top(texts)[0] ?? null,
    fonts: { headings, body },
    logoNodeId,
  }
}

/** Okviri za uvoz: deca strane (i okviri u sekcijama), bez sakrivenih. */
export function frameNodes(page: FigmaNode): FigmaNode[] {
  const out: FigmaNode[] = []
  for (const child of page.children ?? []) {
    if (child.visible === false) continue
    if (child.type === 'SECTION') out.push(...frameNodes(child))
    else if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'].includes(child.type))
      out.push(child)
  }
  return out
}
