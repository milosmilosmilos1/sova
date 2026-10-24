import {
  brandProfileSchema,
  FIELD_PATHS,
  getField,
  overallConfidence,
  setField,
  type BrandProfile,
  type Field,
  type FieldPath,
} from './profile-schema'

/**
 * Spajanje profila (brif 5.3 i 5.6): heuristika je osnova, AI prepisuje polja u kojima je
 * sigurniji i ima vrednost, a zaključana polja iz prethodne verzije ostaju netaknuta.
 * Vizuelna polja, društvene mreže i spisak objava uvek dolaze iz heuristike (deterministični izvori).
 */
export const SYSTEM_PATHS: FieldPath[] = [
  'visual.logo',
  'visual.colors',
  'visual.fonts',
  'social',
  'content.recent_posts',
  'content.has_blog',
]

function hasValue(f: Field<unknown>): boolean {
  const v = f.value
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object')
    return Object.values(v as Record<string, unknown>).some((x) => x !== null && x !== '')
  return true
}

export interface ComposeInput {
  heuristic: BrandProfile
  /** delimičan AI izlaz već pretvoren u polja profila (putanja → Field) */
  ai: Partial<Record<FieldPath, Field<unknown>>> | null
  previous: BrandProfile | null
  lockedFields: string[]
  meta: Partial<BrandProfile['meta']>
}

export function composeProfile(input: ComposeInput): BrandProfile {
  let out: BrandProfile = structuredClone(input.heuristic)

  if (input.ai) {
    for (const path of FIELD_PATHS) {
      if (SYSTEM_PATHS.includes(path)) continue
      const aiField = input.ai[path]
      if (!aiField || !hasValue(aiField)) continue
      const base = getField(out, path)
      // AI pobeđuje kad je bar približno siguran ili kad heuristika nema ništa
      if (aiField.confidence >= 0.3 || !hasValue(base)) {
        out = setField(out, path, { ...aiField, source_urls: aiField.source_urls.slice(0, 10) })
      }
    }
  }

  if (input.previous) {
    const locked = new Set(input.lockedFields)
    for (const path of FIELD_PATHS) {
      if (locked.has(path)) out = setField(out, path, getField(input.previous, path))
    }
    // ručno unete zabranjene reči i činjenice se čuvaju i kad nisu zaključane: dopuna, ne brisanje
    if (!locked.has('voice.forbidden_words')) {
      const prev = input.previous.voice.forbidden_words.value
      const merged = [...new Set([...prev, ...out.voice.forbidden_words.value])].slice(0, 20)
      if (merged.length !== out.voice.forbidden_words.value.length) {
        out = setField(out, 'voice.forbidden_words', {
          ...out.voice.forbidden_words,
          value: merged,
          confidence: Math.max(
            out.voice.forbidden_words.confidence,
            input.previous.voice.forbidden_words.confidence,
          ),
        })
      }
    }
  }

  out.meta = { ...out.meta, ...input.meta, generated_at: new Date().toISOString() }
  out.meta.overall_confidence = overallConfidence(out)
  return brandProfileSchema.parse(out)
}

/** Primena ručnih izmena: vraća nov profil i spisak zaključanih polja. */
export function applyManualChanges(
  current: BrandProfile,
  changes: Array<{ path: FieldPath; value: unknown }>,
  lockedFields: string[],
): { profile: BrandProfile; lockedFields: string[] } {
  let out = structuredClone(current)
  const locked = new Set(lockedFields)
  for (const c of changes) {
    out = setField(out, c.path, { value: c.value, confidence: 1, source_urls: [] })
    locked.add(c.path)
  }
  out.meta = { ...out.meta, generated_by: 'manual', generated_at: new Date().toISOString() }
  out.meta.overall_confidence = overallConfidence(out)
  return { profile: brandProfileSchema.parse(out), lockedFields: [...locked].sort() }
}

/** Kontekst za generisanje teksta (zamena za settings iz faze 5). */
export interface BrandContextFromProfile {
  name: string
  description: string | null
  tone: string | null
  address: 'vi' | 'ti'
  emoji: boolean
  forbiddenWords: string[]
  facts: string[]
  keyTerms: string[]
  hashtags: string[]
  samplePhrases: string[]
  services: string[]
  audience: string | null
  locale: BrandProfile['identity']['content_locale']['value']
  photoStyleSuffix: string | null
  colors: { primary: string; secondary: string; accent: string }
}

export function toBrandContext(profile: BrandProfile): BrandContextFromProfile {
  const facts = profile.facts.value.map((f) => f.claim)
  for (const d of profile.offer.differentiators.value) if (facts.length < 30) facts.push(d)
  for (const g of profile.offer.guarantees.value) if (facts.length < 30) facts.push(g)
  const audience = profile.audience.segments.value.length
    ? profile.audience.segments.value
        .map((s) => (s.description ? `${s.name} (${s.description})` : s.name))
        .join('; ')
    : null
  return {
    name: profile.identity.name.value,
    description: profile.identity.description.value,
    tone: profile.voice.tone.value.length ? profile.voice.tone.value.join(', ') : null,
    address: profile.voice.address.value,
    emoji: profile.voice.emoji.value,
    forbiddenWords: profile.voice.forbidden_words.value,
    facts,
    keyTerms: profile.voice.key_terms.value,
    hashtags: profile.voice.hashtags.value,
    samplePhrases: profile.voice.sample_phrases.value,
    services: profile.offer.services.value.map((s) => s.name),
    audience,
    locale: profile.identity.content_locale.value,
    photoStyleSuffix: profile.visual.photo_style.value?.image_prompt_suffix ?? null,
    colors: {
      primary: profile.visual.colors.value.primary,
      secondary: profile.visual.colors.value.secondary,
      accent: profile.visual.colors.value.accent,
    },
  }
}
