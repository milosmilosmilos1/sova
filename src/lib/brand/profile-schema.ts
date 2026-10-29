import { z } from 'zod'
import { CONTENT_LOCALES } from '@/config/locales'

/**
 * Profil brenda (Brand Brain, brif 5.3): svako polje nosi vrednost, pouzdanost (0–1)
 * i izvore. Čuva se kao `brand_profiles.data`; verzije se ne menjaju, nego se dodaju.
 * `locked_fields` su putanje polja koja je korisnik ručno menjao: nova analiza ih ne dira.
 */
const confidence = z.number().min(0).max(1)
const sourceUrls = z.array(z.string().max(2048)).max(10)

export function field<T extends z.ZodType>(value: T) {
  return z.object({ value, confidence, source_urls: sourceUrls })
}
export type Field<T> = { value: T; confidence: number; source_urls: string[] }

const str = (max: number) => z.string().trim().max(max)
const strList = (max: number, items: number) => z.array(str(max)).max(items)

export const offerItemSchema = z.object({ name: str(120), description: str(400).nullable() })
export const audienceSegmentSchema = z.object({ name: str(120), description: str(400).nullable() })
export const factSchema = z.object({ claim: str(300), source_url: str(2048).nullable() })
export const pillarSchema = z.object({ name: str(80), description: str(300) })
export const recentPostSchema = z.object({
  title: str(200),
  url: str(2048),
  published_at: str(40).nullable(),
})

export const contentLocaleValues = CONTENT_LOCALES
export const addressValues = ['vi', 'ti'] as const
export const formalityValues = ['formal', 'neutral', 'casual'] as const
export const marketValues = ['b2b', 'b2c', 'both', 'unknown'] as const

export const paletteSchema = z.object({
  primary: str(9),
  secondary: str(9),
  accent: str(9),
  neutral_light: str(9),
  neutral_dark: str(9),
  text_on_primary: str(9),
  is_monochrome: z.boolean(),
  candidates: strList(9, 8),
})

export const fontsSchema = z.object({
  headings: str(80).nullable(),
  body: str(80).nullable(),
  mapped_headings: str(80),
  mapped_body: str(80),
  detected: strList(80, 12),
})

export const photoStyleSchema = z.object({
  summary: str(600),
  subjects: strList(80, 8),
  lighting: str(120),
  mood: str(120),
  composition: str(200),
  color_treatment: str(200),
  has_people: z.boolean(),
  avoid: strList(120, 6),
  image_prompt_suffix: str(500),
})
export type PhotoStyle = z.infer<typeof photoStyleSchema>

export const brandProfileSchema = z.object({
  schema_version: z.literal(1),
  identity: z.object({
    name: field(str(120)),
    tagline: field(str(200).nullable()),
    description: field(str(1200).nullable()),
    industry: field(str(120).nullable()),
    location: field(z.object({ city: str(100).nullable(), country: str(100).nullable() })),
    founded_year: field(z.number().int().min(1800).max(2100).nullable()),
    languages: field(strList(10, 6)),
    content_locale: field(z.enum(contentLocaleValues)),
  }),
  offer: z.object({
    services: field(z.array(offerItemSchema).max(30)),
    products: field(z.array(offerItemSchema).max(30)),
    differentiators: field(strList(300, 10)),
    price_hints: field(strList(200, 10)),
    guarantees: field(strList(200, 6)),
  }),
  audience: z.object({
    segments: field(z.array(audienceSegmentSchema).max(8)),
    pain_points: field(strList(300, 10)),
    market: field(z.enum(marketValues)),
  }),
  voice: z.object({
    tone: field(strList(40, 6)),
    address: field(z.enum(addressValues)),
    formality: field(z.enum(formalityValues)),
    emoji: field(z.boolean()),
    sample_phrases: field(strList(200, 8)),
    forbidden_words: field(strList(60, 20)),
    key_terms: field(strList(60, 20)),
    hashtags: field(strList(60, 15)),
  }),
  facts: field(z.array(factSchema).max(30)),
  contact: z.object({
    email: field(str(200).nullable()),
    phone: field(str(60).nullable()),
    address: field(str(300).nullable()),
    working_hours: field(str(300).nullable()),
  }),
  social: field(z.record(z.string().max(40), z.string().max(2048))),
  visual: z.object({
    logo: field(
      z.object({
        asset_id: z.uuid().nullable(),
        source_url: str(2048).nullable(),
        mime_type: str(60).nullable(),
      }),
    ),
    colors: field(paletteSchema),
    fonts: field(fontsSchema),
    photo_style: field(photoStyleSchema.nullable()),
  }),
  content: z.object({
    has_blog: field(z.boolean()),
    blog_topics: field(strList(120, 20)),
    content_pillars: field(z.array(pillarSchema).max(6)),
    recent_posts: field(z.array(recentPostSchema).max(20)),
  }),
  meta: z.object({
    generated_by: z.enum(['ai', 'heuristic', 'manual']),
    model: z.string().nullable(),
    crawl_id: z.uuid().nullable(),
    pages_used: z.number().int().min(0),
    source_url: z.string().nullable(),
    generated_at: z.string(),
    overall_confidence: confidence,
  }),
})

export type BrandProfile = z.infer<typeof brandProfileSchema>

/** Sve putanje do polja (section.key ili samo ključ za facts/social). */
export const FIELD_PATHS = [
  'identity.name',
  'identity.tagline',
  'identity.description',
  'identity.industry',
  'identity.location',
  'identity.founded_year',
  'identity.languages',
  'identity.content_locale',
  'offer.services',
  'offer.products',
  'offer.differentiators',
  'offer.price_hints',
  'offer.guarantees',
  'audience.segments',
  'audience.pain_points',
  'audience.market',
  'voice.tone',
  'voice.address',
  'voice.formality',
  'voice.emoji',
  'voice.sample_phrases',
  'voice.forbidden_words',
  'voice.key_terms',
  'voice.hashtags',
  'facts',
  'contact.email',
  'contact.phone',
  'contact.address',
  'contact.working_hours',
  'social',
  'visual.logo',
  'visual.colors',
  'visual.fonts',
  'visual.photo_style',
  'content.has_blog',
  'content.blog_topics',
  'content.content_pillars',
  'content.recent_posts',
] as const

export type FieldPath = (typeof FIELD_PATHS)[number]
export const fieldPathSchema = z.enum(FIELD_PATHS)

/** Polja koja korisnik sme da menja ručno (ostala puni sistem). */
export const EDITABLE_PATHS: FieldPath[] = FIELD_PATHS.filter(
  (p) => !['visual.logo', 'content.recent_posts', 'content.has_blog'].includes(p),
)

export function getField(profile: BrandProfile, path: FieldPath): Field<unknown> {
  const [a, b] = path.split('.') as [keyof BrandProfile, string | undefined]
  const section = profile[a] as unknown
  if (!b) return section as Field<unknown>
  return (section as Record<string, Field<unknown>>)[b]!
}

export function setField(profile: BrandProfile, path: FieldPath, value: Field<unknown>): BrandProfile {
  const [a, b] = path.split('.') as [keyof BrandProfile, string | undefined]
  const next = { ...profile } as Record<string, unknown>
  if (!b) {
    next[a] = value
    return next as unknown as BrandProfile
  }
  next[a] = { ...(profile[a] as Record<string, unknown>), [b]: value }
  return next as unknown as BrandProfile
}

/** Zod šema vrednosti jednog polja (za validaciju ručnih izmena). */
export function valueSchemaFor(path: FieldPath): z.ZodType {
  const [a, b] = path.split('.') as [keyof BrandProfile, string | undefined]
  const shape = brandProfileSchema.shape[a]
  const fieldSchema = (b ? (shape as z.ZodObject).shape[b] : shape) as z.ZodObject
  return fieldSchema.shape.value as z.ZodType
}

export function emptyField<T>(value: T, confidence = 0): Field<T> {
  return { value, confidence, source_urls: [] }
}

/** Prazan profil za brend bez sajta ili pre prve analize (brif 5.7 B11). */
export function emptyProfile(input: {
  name: string
  contentLocale: BrandProfile['identity']['content_locale']['value']
  websiteUrl: string | null
}): BrandProfile {
  return {
    schema_version: 1,
    identity: {
      name: emptyField(input.name, 1),
      tagline: emptyField(null),
      description: emptyField(null),
      industry: emptyField(null),
      location: emptyField({ city: null, country: null }),
      founded_year: emptyField(null),
      languages: emptyField([]),
      content_locale: emptyField(input.contentLocale, 1),
    },
    offer: {
      services: emptyField([]),
      products: emptyField([]),
      differentiators: emptyField([]),
      price_hints: emptyField([]),
      guarantees: emptyField([]),
    },
    audience: { segments: emptyField([]), pain_points: emptyField([]), market: emptyField('unknown') },
    voice: {
      tone: emptyField([]),
      address: emptyField('vi', 0.5),
      formality: emptyField('neutral', 0.3),
      emoji: emptyField(false, 0.3),
      sample_phrases: emptyField([]),
      forbidden_words: emptyField([]),
      key_terms: emptyField([]),
      hashtags: emptyField([]),
    },
    facts: emptyField([]),
    contact: {
      email: emptyField(null),
      phone: emptyField(null),
      address: emptyField(null),
      working_hours: emptyField(null),
    },
    social: emptyField({}),
    visual: {
      logo: emptyField({ asset_id: null, source_url: null, mime_type: null }),
      colors: emptyField({
        primary: '#1f2937',
        secondary: '#111827',
        accent: '#f59e0b',
        neutral_light: '#f8fafc',
        neutral_dark: '#111827',
        text_on_primary: '#ffffff',
        is_monochrome: true,
        candidates: [],
      }),
      fonts: emptyField({
        headings: null,
        body: null,
        mapped_headings: 'Inter',
        mapped_body: 'Inter',
        detected: [],
      }),
      photo_style: emptyField(null),
    },
    content: {
      has_blog: emptyField(false),
      blog_topics: emptyField([]),
      content_pillars: emptyField([]),
      recent_posts: emptyField([]),
    },
    meta: {
      generated_by: 'manual',
      model: null,
      crawl_id: null,
      pages_used: 0,
      source_url: input.websiteUrl,
      generated_at: new Date().toISOString(),
      overall_confidence: 0,
    },
  }
}

/** Prosečna pouzdanost popunjenih polja. */
export function overallConfidence(profile: BrandProfile): number {
  const values = FIELD_PATHS.map((p) => getField(profile, p)).filter((f) => {
    const v = f.value
    if (v === null || v === undefined) return false
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Object.keys(v as object).length > 0
    return true
  })
  if (!values.length) return 0
  return Math.round((values.reduce((s, f) => s + f.confidence, 0) / values.length) * 100) / 100
}
