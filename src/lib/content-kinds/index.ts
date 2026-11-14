import type { PostFormat } from '@/config/post-formats'
import {
  DATA_KINDS,
  kindAvailability,
  kindState,
  type BeforeAfterPair,
  type ContentKind,
  type StoredContent,
  type TeamMember,
  type Testimonial,
} from '@/lib/schemas/brand-content'

/**
 * Vrste sadržaja u planu (D-165, faza 2): koji termin dobija utisak klijenta, osobu iz tima, rad pre i
 * posle, pitanje za publiku ili humor, i koju stavku. Vrste sa podacima i uključene vrste raspoređuje
 * kod, ravnomerno kroz mesec; pitanja i humor na „Automatski” predlaže model, samo kad pristaju brendu.
 */
export type DataKind = 'review' | 'team' | 'before_after'
export type FreeKind = 'interactive' | 'humor'
export const FREE_KINDS: readonly FreeKind[] = ['interactive', 'humor']

export type KindTarget =
  | { kind: 'review'; item: Testimonial }
  | { kind: 'team'; item: TeamMember }
  | { kind: 'before_after'; item: BeforeAfterPair }
  | { kind: FreeKind }

/** Vrsta termina u planu, čuva se u `month_plans.settings.slots[i]`. */
export interface SlotKind {
  kind: ContentKind
  /** id utiska, osobe ili para; null za pitanja i humor */
  ref: string | null
}

/**
 * Formati koji nose vrstu. Pre i posle je za sada samo karusel: prvi slajd nosi fotografiju pre,
 * drugi fotografiju posle.
 */
export const KIND_FORMATS: Record<ContentKind, readonly PostFormat[]> = {
  review: ['image', 'carousel', 'story', 'text'],
  team: ['image', 'carousel', 'story', 'text'],
  before_after: ['carousel'],
  interactive: ['story', 'text', 'carousel', 'image'],
  humor: ['image', 'text', 'carousel'],
}

const ORDER: readonly ContentKind[] = ['review', 'before_after', 'team', 'interactive', 'humor']

type DataItem = Testimonial | TeamMember | BeforeAfterPair

export function isDataKind(kind: ContentKind): kind is DataKind {
  return DATA_KINDS.has(kind)
}

export function kindItems(content: StoredContent, kind: DataKind): DataItem[] {
  return kind === 'review' ? content.testimonials : kind === 'team' ? content.team : content.pairs
}

/**
 * Stavke koje plan može da uzme: bez onih već uzetih u ovom planu; prvo nekorišćene (novije prve),
 * pa one korišćene najdavnije.
 */
export function pickRefs(content: StoredContent, kind: DataKind, used: ReadonlySet<string>): DataItem[] {
  return kindItems(content, kind)
    .filter((i) => !used.has(i.id))
    .sort((a, b) => {
      if (Boolean(a.usedAt) !== Boolean(b.usedAt)) return a.usedAt ? 1 : -1
      if (a.usedAt && b.usedAt) return a.usedAt.localeCompare(b.usedAt)
      return b.createdAt.localeCompare(a.createdAt)
    })
}

/** Koliko od `slots` termina meseca dobija vrstu: oko svaki deseti za podatke, svaki osmi za ostale. */
export function kindQuota(kind: ContentKind, slots: number): number {
  if (slots <= 0) return 0
  return Math.max(1, Math.floor(slots / (isDataKind(kind) ? 10 : 8)))
}

function fits(
  kinds: ReadonlyArray<SlotKind | null>,
  formats: readonly PostFormat[],
  pos: number,
  kind: ContentKind,
  strict: boolean,
): boolean {
  if (kinds[pos] || !KIND_FORMATS[kind].includes(formats[pos]!)) return false
  return !strict || (kinds[pos - 1]?.kind !== kind && kinds[pos + 1]?.kind !== kind)
}

/** Najbliži slobodan termin koji nosi vrstu; prvo bez iste vrste u susedstvu, pa bez tog uslova. */
function nearestSlot(
  kinds: ReadonlyArray<SlotKind | null>,
  formats: readonly PostFormat[],
  target: number,
  kind: ContentKind,
): number | null {
  for (const strict of [true, false])
    for (let d = 0; d < formats.length; d++)
      for (const pos of d === 0 ? [target] : [target + d, target - d])
        if (pos >= 0 && pos < formats.length && fits(kinds, formats, pos, kind, strict)) return pos
  return null
}

/**
 * Vrste za termine jednog meseca (redom kao `formats`). Vrsta ide samo na format koji je nosi,
 * ravnomerno kroz mesec; utisak, osoba i par se ne ponavljaju u istom planu (`used`).
 */
export function assignKinds(input: {
  formats: readonly PostFormat[]
  content: StoredContent
  used: ReadonlySet<string>
}): Array<SlotKind | null> {
  const n = input.formats.length
  const kinds: Array<SlotKind | null> = Array.from({ length: n }, () => null)
  ORDER.forEach((kind, offset) => {
    if (kindAvailability(input.content, kind) !== 'yes') return
    const refs = isDataKind(kind) ? pickRefs(input.content, kind, input.used) : null
    const count = refs ? Math.min(kindQuota(kind, n), refs.length) : kindQuota(kind, n)
    for (let j = 0; j < count; j++) {
      const target = (Math.floor(((j + 0.5) * n) / count) + offset) % n
      const pos = nearestSlot(kinds, input.formats, target, kind)
      if (pos === null) break
      kinds[pos] = { kind, ref: refs ? refs[j]!.id : null }
    }
  })
  return kinds
}

/** Pitanja i humor koje model sme sam da predloži (vrsta na „Automatski”). */
export function autoKinds(content: StoredContent): FreeKind[] {
  return FREE_KINDS.filter((k) => kindAvailability(content, k) === 'auto')
}

/** Najviše predloga modela po vrsti u mesecu sa `slots` termina. */
export function autoQuota(slots: number): number {
  return Math.max(1, Math.floor(slots / 10))
}

/**
 * Predlozi modela za termine bez vrste: samo dozvoljene vrste, na formatu koji ih nosi i do kvote.
 * `proposed` je vrsta po indeksu termina u mesecu.
 */
export function applyAutoKinds(
  assigned: ReadonlyArray<SlotKind | null>,
  proposed: ReadonlyMap<number, string | null | undefined>,
  formats: readonly PostFormat[],
  allowed: readonly FreeKind[],
): Array<SlotKind | null> {
  const out = [...assigned]
  const counts = new Map<FreeKind, number>()
  const max = autoQuota(formats.length)
  for (let i = 0; i < out.length; i++) {
    const kind = allowed.find((k) => k === proposed.get(i))
    if (out[i] || !kind || !KIND_FORMATS[kind].includes(formats[i]!)) continue
    const used = counts.get(kind) ?? 0
    if (used >= max) continue
    counts.set(kind, used + 1)
    out[i] = { kind, ref: null }
  }
  return out
}

export type ResolvedKind = { target: KindTarget } | { problem: 'off' | 'missing' | 'format' } | null

/**
 * Šta stavka plana pravi u trenutku pravljenja: vrstu sa njenom stavkom, problem kad je vrsta u
 * međuvremenu isključena, stavka obrisana ili je korisnik stavci dao format koji vrsta sa podacima
 * ne nosi (osoba iz tima kao video bi dobila tuđe snimke), ili null za običnu objavu.
 */
export function resolveKind(
  content: StoredContent,
  slot: SlotKind | null | undefined,
  format?: PostFormat,
): ResolvedKind {
  if (!slot) return null
  if (kindState(content, slot.kind) === 'off') return { problem: 'off' }
  if (!isDataKind(slot.kind)) return { target: { kind: slot.kind as FreeKind } }
  const item = kindItems(content, slot.kind).find((i) => i.id === slot.ref)
  if (!item) return { problem: 'missing' }
  if (format && !KIND_FORMATS[slot.kind].includes(format)) return { problem: 'format' }
  return { target: { kind: slot.kind, item } as KindTarget }
}

/** Vrsta iz sačuvanog termina plana (stari planovi i neispravne vrednosti daju null). */
export function slotKindOf(slot: unknown): SlotKind | null {
  const s = slot as { kind?: unknown; ref?: unknown } | null | undefined
  if (!s || typeof s.kind !== 'string' || !ORDER.includes(s.kind as ContentKind)) return null
  return { kind: s.kind as ContentKind, ref: typeof s.ref === 'string' ? s.ref : null }
}
