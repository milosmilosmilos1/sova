import type { ContentLocale } from '@/config/locales'
import type { BrandProfile } from '@/lib/brand/profile-schema'
import {
  brandVoiceSchema,
  isVoiceEmpty,
  uniqueTopics,
  VOICE_LIMITS,
  type BrandVoice,
} from '@/lib/schemas/voice'
import { fill, toCyrillic } from '@/lib/templates/phrases'

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

interface CtaPhrases {
  phoneEmail: string
  phone: string
  email: string
  messenger: string
  site: string
  dm: string
}

/** Poziv na akciju po kontaktu; {0} i {1} su telefon, email, aplikacija za poruke ili sajt. */
const CTA: Record<'vi' | 'ti' | 'en', CtaPhrases> = {
  vi: {
    phoneEmail: 'Pozovite {0} ili nam pišite na {1}.',
    phone: 'Pozovite {0}.',
    email: 'Pišite nam na {0}.',
    messenger: 'Pišite nam na {0}.',
    site: 'Pogledajte ponudu na {0}.',
    dm: 'Pišite nam u poruke.',
  },
  ti: {
    phoneEmail: 'Pozovi {0} ili nam piši na {1}.',
    phone: 'Pozovi {0}.',
    email: 'Piši nam na {0}.',
    messenger: 'Piši nam na {0}.',
    site: 'Pogledaj ponudu na {0}.',
    dm: 'Piši nam u poruke.',
  },
  en: {
    phoneEmail: 'Call {0} or email {1}.',
    phone: 'Call {0}.',
    email: 'Email us at {0}.',
    messenger: 'Message us on {0}.',
    site: 'See more at {0}.',
    dm: 'Send us a message.',
  },
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function ctaPhrases(locale: ContentLocale, address: 'vi' | 'ti'): CtaPhrases {
  const set = locale === 'en' ? CTA.en : CTA[address]
  if (locale !== 'sr-Cyrl') return set
  return Object.fromEntries(Object.entries(set).map(([k, v]) => [k, toCyrillic(v)])) as unknown as CtaPhrases
}

/** Poziv na akciju kad ništa nije poznato o kontaktu: poziv da pišu u poruke. */
export function defaultCta(locale: ContentLocale, address: 'vi' | 'ti' = 'vi'): string {
  return ctaPhrases(locale, address).dm
}

/**
 * Predlog poziva na akciju iz profila sa sajta (D-174, uvod traži ovo polje): telefon i email, pa
 * WhatsApp ili Viber, pa sajt, inače poziv da pišu u poruke. Na jeziku objava brenda, sa „vi” ili
 * „ti” kako se brend obraća; kontakt se upisuje kako je na sajtu (ćirilica prevodi samo reči).
 */
export function ctaFromProfile(profile: BrandProfile, locale?: ContentLocale): string {
  const lang = locale ?? profile.identity.content_locale.value
  const p = ctaPhrases(lang, profile.voice.address.value)
  const phone = profile.contact.phone.value?.trim() || null
  const email = profile.contact.email.value?.trim() || null
  const social = profile.social.value ?? {}
  const messenger = 'whatsapp' in social ? 'WhatsApp' : 'viber' in social ? 'Viber' : null
  const site = domainOf(profile.meta.source_url)
  const candidates = [
    phone && email ? fill(p.phoneEmail, phone, email) : null,
    phone ? fill(p.phone, phone) : null,
    email ? fill(p.email, email) : null,
    messenger ? fill(p.messenger, messenger) : null,
    site ? fill(p.site, site) : null,
  ]
  return candidates.find((c): c is string => Boolean(c) && c!.length <= VOICE_LIMITS.cta) ?? p.dm
}

/**
 * Predlog glasa iz profila sa sajta, bez AI poziva; teme iz stubova sadržaja i bloga, a poziv na
 * akciju iz kontakta (na jeziku objava brenda kad je dat).
 */
export function voiceFromProfile(profile: BrandProfile, locale?: ContentLocale): BrandVoice {
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
    cta: ctaFromProfile(profile, locale),
    topics: topics.slice(0, 6).map((t) => clip(t, 160)),
  }
}
