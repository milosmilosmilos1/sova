import { SETUP_STEPS, type SetupStep } from '@/lib/schemas/setup'
import { VOICE_TEXT_FIELDS, type BrandVoice, type VoiceTextField } from '@/lib/schemas/voice'

/**
 * Kompletan brend (D-174): pre prve objave brend mora imati sve što Sovi treba da piše i crta u
 * njegovom stilu. Brain je učio bar iz jednog izvora (sajt, PDF ili beleška), glas brenda ima sva
 * polja i bar tri teme, a vizuelni identitet logo, izabrane boje i stil objava. Mreže nisu uslov:
 * objava može da se preuzme i objavi ručno, a mreže čekaju odobrenja platformi.
 */
export const READINESS_ITEMS = ['brain', 'voice', 'topics', 'logo', 'colors', 'style'] as const
export type ReadinessItem = (typeof READINESS_ITEMS)[number]

/** Najmanje glavnih tema u glasu brenda. */
export const MIN_TOPICS = 3

/** Korak uvoda na kom se stavka rešava. */
export const READINESS_STEP: Record<ReadinessItem, SetupStep> = {
  brain: 'analysis',
  voice: 'brand',
  topics: 'brand',
  logo: 'colors',
  colors: 'colors',
  style: 'style',
}

export interface ReadinessFacts {
  /** uspešne analize sajta, pročitani PDF-ovi i beleške */
  brainSources: number
  voice: BrandVoice | null
  logo: boolean
  /** boje ili izgled je izabrao korisnik, ne samo predlog sa sajta */
  colors: boolean
  /** stil objava je izabrao korisnik */
  style: boolean
}

export interface Readiness {
  items: Record<ReadinessItem, boolean>
  missing: ReadinessItem[]
  /** prazna polja glasa brenda */
  missingVoice: VoiceTextField[]
  topics: number
  complete: boolean
}

export function readinessFrom(facts: ReadinessFacts): Readiness {
  const missingVoice = VOICE_TEXT_FIELDS.filter((field) => !facts.voice?.[field]?.trim())
  const topics = facts.voice?.topics.length ?? 0
  const items: Record<ReadinessItem, boolean> = {
    brain: facts.brainSources > 0,
    voice: missingVoice.length === 0,
    topics: topics >= MIN_TOPICS,
    logo: facts.logo,
    colors: facts.colors,
    style: facts.style,
  }
  const missing = READINESS_ITEMS.filter((item) => !items[item])
  return { items, missing, missingVoice, topics, complete: missing.length === 0 }
}

/** Korak uvoda (1–7) na kom je prva stavka koja fali; kad je sve tu, poslednji korak. */
export function readinessStep(readiness: Pick<Readiness, 'missing'>): number {
  const first = readiness.missing[0]
  return SETUP_STEPS.indexOf(first ? READINESS_STEP[first] : 'done') + 1
}

/** Korak je gotov kad su sve njegove stavke tu; koraci bez uslova (jezik, mreže) uvek su gotovi. */
export function stepReady(readiness: Pick<Readiness, 'items'>, step: SetupStep): boolean {
  return READINESS_ITEMS.every((item) => READINESS_STEP[item] !== step || readiness.items[item])
}
