import { z } from 'zod'

/**
 * Vrste sadržaja koje traže stvarne podatke biznisa ili poseban ton (D-165): utisci klijenata, pre i posle,
 * predstavljanje tima, interaktivne objave (anketa, kviz, pitanje) i humor. Podaci se čuvaju u
 * `brands.settings.content`, bez migracije. Sova nikad ne izmišlja utiske, ljude ni rezultate: te tri
 * vrste koriste samo ono što je biznis uneo.
 */
export const CONTENT_KINDS = ['review', 'before_after', 'team', 'interactive', 'humor'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

/** Vrste koje postoje samo uz podatke biznisa (bez podataka se ne predlažu). */
export const DATA_KINDS: ReadonlySet<ContentKind> = new Set(['review', 'before_after', 'team'])

export const CONTENT_LISTS = ['testimonials', 'team', 'pairs'] as const
export type ContentList = (typeof CONTENT_LISTS)[number]

export const TESTIMONIALS_MAX = 100
export const TEAM_MAX = 30
export const PAIRS_MAX = 50

export const contentItemIdSchema = z.string().regex(/^[a-z0-9]{10}$/)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const TESTIMONIAL_SOURCES = ['google', 'facebook', 'instagram', 'website', 'direct', 'other'] as const

export const testimonialInputSchema = z.object({
  /** ime ili ime i inicijal prezimena, kako je klijent pristao da se objavi */
  author: z.string().trim().min(1).max(80),
  /** kratko: „vlasnica stana na Vračaru”, „kupac iz Novog Sada” */
  detail: optionalText(80),
  text: z.string().trim().min(10).max(1200),
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullish()
    .transform((v) => v ?? null),
  source: z.enum(TESTIMONIAL_SOURCES).default('direct'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
})
export type TestimonialInput = z.infer<typeof testimonialInputSchema>

export const teamMemberInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(80),
  /** par rečenica: šta radi, koliko dugo, šta voli u poslu */
  bio: optionalText(600),
  /** zanimljivost za opušteniju objavu */
  funFact: optionalText(200),
  photoAssetId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
})
export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>

export const beforeAfterInputSchema = z.object({
  /** „Kupatilo, Vračar”, „Fasada porodične kuće” */
  title: z.string().trim().min(3).max(100),
  /** šta je urađeno, koliko je trajalo */
  note: optionalText(600),
  beforeAssetId: z.uuid(),
  afterAssetId: z.uuid(),
})
export type BeforeAfterInput = z.infer<typeof beforeAfterInputSchema>

const stored = {
  id: contentItemIdSchema,
  createdAt: z.string(),
  /** kad je stavka poslednji put iskorišćena u objavi (da se ne ponavlja) */
  usedAt: z.string().nullable().default(null),
}

export const testimonialSchema = testimonialInputSchema.extend(stored)
export const teamMemberSchema = teamMemberInputSchema.extend(stored)
export const beforeAfterSchema = beforeAfterInputSchema.extend(stored)
export type Testimonial = z.infer<typeof testimonialSchema>
export type TeamMember = z.infer<typeof teamMemberSchema>
export type BeforeAfterPair = z.infer<typeof beforeAfterSchema>

/** Prekidač po vrsti: nema ključa = Sova odlučuje sama (vrste sa podacima kad podataka ima). */
export const contentKindsSchema = z
  .object(Object.fromEntries(CONTENT_KINDS.map((k) => [k, z.boolean().nullable().optional()])))
  .partial() as z.ZodType<Partial<Record<ContentKind, boolean | null>>>

export const storedContentSchema = z.object({
  kinds: contentKindsSchema.default({}),
  testimonials: z.array(testimonialSchema).max(TESTIMONIALS_MAX).default([]),
  team: z.array(teamMemberSchema).max(TEAM_MAX).default([]),
  pairs: z.array(beforeAfterSchema).max(PAIRS_MAX).default([]),
})
export type StoredContent = z.infer<typeof storedContentSchema>

function validItems<T>(schema: z.ZodType<T>, value: unknown, max: number): T[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const parsed = schema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
    .slice(0, max)
}

/**
 * Sačuvan sadržaj iz `brands.settings`. Proverava stavku po stavku: neispravna stavka (stara šema, ručna
 * izmena u bazi) ispada sama, a ne cela lista, jer sledeći upis piše ono što je ovde pročitano.
 */
export function storedContent(settings: unknown): StoredContent {
  const raw = (settings as { content?: unknown } | null)?.content
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const kinds = contentKindsSchema.safeParse(obj.kinds ?? {})
  return {
    kinds: kinds.success ? kinds.data : {},
    testimonials: validItems(testimonialSchema, obj.testimonials, TESTIMONIALS_MAX),
    team: validItems(teamMemberSchema, obj.team, TEAM_MAX),
    pairs: validItems(beforeAfterSchema, obj.pairs, PAIRS_MAX),
  }
}

export type KindState = 'auto' | 'on' | 'off'

export function kindState(content: StoredContent, kind: ContentKind): KindState {
  const v = content.kinds[kind]
  return v === true ? 'on' : v === false ? 'off' : 'auto'
}

/**
 * Da li Sova sme da predloži vrstu: isključena nikad; vrste sa podacima samo kad podataka ima;
 * interaktivne i humor u „auto” režimu Sova procenjuje po delatnosti i tonu brenda (`auto`).
 */
export function kindAvailability(content: StoredContent, kind: ContentKind): 'yes' | 'no' | 'auto' {
  const state = kindState(content, kind)
  if (state === 'off') return 'no'
  if (DATA_KINDS.has(kind)) {
    const has =
      kind === 'review'
        ? content.testimonials.length > 0
        : kind === 'team'
          ? content.team.length > 0
          : content.pairs.length > 0
    return has ? 'yes' : 'no'
  }
  return state === 'on' ? 'yes' : 'auto'
}

export const contentKindsUpdateSchema = z.object({
  kinds: z.object(
    Object.fromEntries(CONTENT_KINDS.map((k) => [k, z.enum(['auto', 'on', 'off']).optional()])),
  ) as z.ZodType<Partial<Record<ContentKind, KindState>>>,
})

export const contentListParamSchema = z.object({
  id: z.uuid({ error: 'Neispravan identifikator.' }),
  list: z.enum(CONTENT_LISTS),
})

export const contentItemParamSchema = contentListParamSchema.extend({ itemId: contentItemIdSchema })

export const CONTENT_INPUT_SCHEMAS = {
  testimonials: testimonialInputSchema,
  team: teamMemberInputSchema,
  pairs: beforeAfterInputSchema,
} as const

export const CONTENT_LIST_MAX: Record<ContentList, number> = {
  testimonials: TESTIMONIALS_MAX,
  team: TEAM_MAX,
  pairs: PAIRS_MAX,
}
