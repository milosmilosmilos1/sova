import type { BrandProfile } from '@/lib/brand/profile-schema'
import { brandVoiceSchema, isVoiceEmpty, uniqueTopics, type BrandVoice } from '@/lib/schemas/voice'

/**
 * Glas brenda (D-112): čitanje sačuvanog i predlog iz profila sa sajta, bez baze i AI poziva.
 * Sačuvan glas iz baze; prazan ili neispravan je null.
 */
export function parseVoice(raw: unknown): BrandVoice | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = brandVoiceSchema.safeParse(raw)
  if (!parsed.success || isVoiceEmpty(parsed.data)) return null
  return parsed.data
}

export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Predlog glasa iz profila sa sajta, bez AI poziva; teme iz stubova sadržaja i bloga. */
export function voiceFromProfile(profile: BrandProfile): BrandVoice {
  const services = [...profile.offer.services.value, ...profile.offer.products.value].map((s) => s.name)
  const description = profile.identity.description.value
  const audience = profile.audience.segments.value
    .map((s) => (s.description ? `${s.name} (${s.description})` : s.name))
    .join('; ')
  const topics = uniqueTopics([
    ...profile.content.content_pillars.value.map((p) => p.name),
    ...profile.content.blog_topics.value,
  ]).filter((t) => t.length >= 3)
  return {
    offer: clip(description || services.join(', '), 600),
    audience: clip(audience, 400),
    tone: clip(profile.voice.tone.value.join(', '), 200),
    usp: clip(profile.offer.differentiators.value.join('; '), 400),
    avoid: clip(profile.voice.forbidden_words.value.join(', '), 400),
    cta: '',
    topics: topics.slice(0, 6).map((t) => clip(t, 160)),
  }
}
