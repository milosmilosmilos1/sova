import { slideRanges, SLIDES_PER_STEP } from './batches'
import type { Slide } from './types'

/**
 * Tekst na slikama (D-129): korisnik sam menja reči na slajdovima i kadrovima videa, a vrsta
 * slajda, raspored, fotografije i tema ostaju. Ovde su pravila koja dele pregled i čuvanje:
 * čišćenje unosa i koji slajdovi su stvarno izmenjeni, jer se samo oni crtaju ponovo.
 */
export interface SlideText {
  kicker?: string | null
  title: string
  body?: string | null
  stat?: string | null
  items?: string[] | null
}

/** Jedan red: razmaci i prelomi postaju jedan razmak; prazno je `null`. */
function line(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim()
  return text ? text : null
}

/** Tekst slajda zadržava prelome redova (stil „Lista” od njih pravi stavke), bez praznih redova. */
function paragraph(value: string | null | undefined): string | null {
  const text = value
    ?.split(/\r?\n/)
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return text ? text : null
}

/** Nov tekst preko slajda: vrsta slajda ostaje, prazno polje briše taj deo, naslov ne sme da nestane. */
export function withSlideText(slide: Slide, text: SlideText): Slide {
  const items = (text.items ?? []).map(line).filter((i): i is string => Boolean(i))
  return {
    kind: slide.kind,
    kicker: line(text.kicker),
    title: line(text.title) ?? slide.title,
    body: paragraph(text.body),
    stat: line(text.stat),
    items: items.length ? items : null,
  }
}

const key = (s: Slide) =>
  JSON.stringify([
    s.kicker ?? null,
    s.title,
    s.body ?? null,
    s.stat ?? null,
    s.items?.length ? s.items : null,
  ])

/**
 * Slajdovi čiji se tekst promenio. Stari tekst prolazi isto čišćenje kao nov, pa razmak viška iz
 * ranijeg generisanja ne crta slajd ponovo.
 */
export function changedSlides(before: Slide[], after: Slide[]): number[] {
  return after.flatMap((slide, i) => {
    const old = before[i]
    return old && key(withSlideText(old, old)) === key(slide) ? [] : [i]
  })
}

/** Uzastopni izmenjeni slajdovi kao delovi [od, do), da se fotografije za deo pripreme zajedno. */
export function changedRanges(indexes: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const i of [...new Set(indexes)].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    if (last && last[1] === i) last[1] = i + 1
    else out.push([i, i + 1])
  }
  return out
}

/** Delovi od najviše `size` (tri) uzastopna izmenjena slajda, kao koraci pozadinskog posla (D-122). */
export function changedChunks(indexes: number[], size = SLIDES_PER_STEP): Array<[number, number]> {
  return changedRanges(indexes).flatMap(([from, to]) =>
    slideRanges(to - from, size).map(([a, b]): [number, number] => [from + a, from + b]),
  )
}
