import { z } from 'zod'

/**
 * Glas brenda (D-112): reči vlasnika o tome šta nudi, kome, kako zvuči, po čemu je drugačiji, šta
 * izbegava i koje su mu glavne teme. Ima prednost nad onim što je analiza zaključila sa sajta.
 */
export const VOICE_TOPICS_MAX = 8
export const VOICE_LIMITS = { offer: 600, audience: 400, tone: 200, usp: 400, avoid: 400, cta: 160 } as const
export const VOICE_TEXT_FIELDS = ['offer', 'audience', 'tone', 'usp', 'avoid', 'cta'] as const
export type VoiceTextField = (typeof VOICE_TEXT_FIELDS)[number]

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Najviše ${max} znakova.` })

export const voiceTopicSchema = z
  .string()
  .trim()
  .min(3, { error: 'Tema ima bar tri znaka.' })
  .max(160, { error: 'Tema ima najviše 160 znakova.' })

export const brandVoiceSchema = z.object({
  offer: text(VOICE_LIMITS.offer).default(''),
  audience: text(VOICE_LIMITS.audience).default(''),
  tone: text(VOICE_LIMITS.tone).default(''),
  usp: text(VOICE_LIMITS.usp).default(''),
  avoid: text(VOICE_LIMITS.avoid).default(''),
  cta: text(VOICE_LIMITS.cta).default(''),
  topics: z
    .array(voiceTopicSchema)
    .max(VOICE_TOPICS_MAX, { error: `Najviše ${VOICE_TOPICS_MAX} tema.` })
    .default([])
    .transform(uniqueTopics),
})
export type BrandVoice = z.infer<typeof brandVoiceSchema>

export const EMPTY_VOICE: BrandVoice = {
  offer: '',
  audience: '',
  tone: '',
  usp: '',
  avoid: '',
  cta: '',
  topics: [],
}

/** Iste teme bez obzira na velika i mala slova pojavljuju se jednom, prvim redom. */
export function uniqueTopics(topics: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of topics) {
    const key = t.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(t.trim())
  }
  return out
}

export function isVoiceEmpty(v: BrandVoice): boolean {
  return VOICE_TEXT_FIELDS.every((f) => !v[f]) && v.topics.length === 0
}

/** Predlog popunjava samo prazna polja; teme se dodaju na postojeće, bez duplikata i najviše osam. */
export function mergeVoice(current: BrandVoice, draft: BrandVoice): BrandVoice {
  const out: BrandVoice = { ...current }
  for (const f of VOICE_TEXT_FIELDS) if (!current[f].trim()) out[f] = draft[f]
  out.topics = uniqueTopics([...current.topics, ...draft.topics]).slice(0, VOICE_TOPICS_MAX)
  return out
}
