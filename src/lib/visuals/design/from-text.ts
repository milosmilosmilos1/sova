import type { Slide } from './types'

/**
 * Slajdovi od teksta objave (D-125): Autopilot piše objavu kao uvod, tekst i poziv na akciju, a
 * vizual u temi brenda pravi se od tih delova, bez još jednog poziva modelu. Objava i priča imaju
 * jedan slajd; karusel ima naslovni slajd, do tri tačke iz teksta i poziv na akciju.
 */
export interface PostParts {
  hook: string
  body: string
  cta: string
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:–-]+$/, '')}…`
}

/** Rečenice teksta bez heštegova i praznih redova. */
function sentences(text: string): string[] {
  return text
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

export function slidesFromText(parts: PostParts, format: 'single' | 'story' | 'carousel'): Slide[] {
  const body = sentences(parts.body)
  const title = clip(parts.hook || body[0] || parts.cta, 90)
  if (format !== 'carousel') {
    const rest = parts.hook ? body[0] : body[1]
    return [{ kind: 'cover', title, body: rest ? clip(rest, 140) : null }]
  }
  // tačke: po jedna rečenica kao naslov i sledeća kao objašnjenje, najviše tri
  const points: Slide[] = []
  for (let i = parts.hook ? 0 : 1; i < body.length && points.length < 3; i += 2)
    points.push({
      kind: 'point',
      title: clip(body[i]!, 80),
      body: body[i + 1] ? clip(body[i + 1]!, 140) : null,
    })
  const cta: Slide = { kind: 'cta', title: clip(parts.cta || title, 80), body: null }
  return [{ kind: 'cover', title, body: null }, ...points, cta]
}
