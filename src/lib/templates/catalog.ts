/**
 * Šabloni koje biznis popunjava sam (D-175): sadržaj koji Sova ne sme da izmisli (ljudi, utisci,
 * radovi, rezultati, cene, datumi, pravila nagradne igre). Korisnik upiše podatke, Sova od njih
 * nacrta slajdove u stilu brenda i složi opis, bez AI-ja i bez tokena, a nacrt se zakazuje kao svaki
 * drugi. Polja su opisana ovde; proveru unosa pravi `schema.ts`, a slajdove i opis `build.ts`.
 */
export const TEMPLATE_GROUPS = ['people', 'community', 'offer', 'news'] as const
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number]

export const TEMPLATE_IDS = [
  'team',
  'testimonial',
  'before_after',
  'case_study',
  'behind_scenes',
  'quiz',
  'poll',
  'faq',
  'giveaway',
  'offer',
  'launch',
  'price_list',
  'event',
  'milestone',
  'hiring',
  'announcement',
  'award',
  'partnership',
] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

/** Oblik objave iz šablona: jedna slika, karusel ili priča (9:16). */
export const TEMPLATE_FORMATS = ['image', 'carousel', 'story'] as const
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'photo'
  | 'photos'
  | 'list'
  | 'pairs'
  | 'prices'
  | 'rating'
  | 'date'
  | 'time'
  | 'choice'

export interface FieldDef {
  key: string
  kind: FieldKind
  required?: boolean
  /** najviše znakova (tekst) */
  max?: number
  /** najmanje i najviše stavki (lista, parovi, fotografije) */
  minItems?: number
  maxItems?: number
}

export interface TemplateDef {
  id: TemplateId
  group: TemplateGroup
  formats: readonly TemplateFormat[]
  fields: readonly FieldDef[]
}

const text = (key: string, max: number, required = false): FieldDef => ({ key, kind: 'text', max, required })
const area = (key: string, max: number, required = false): FieldDef => ({
  key,
  kind: 'textarea',
  max,
  required,
})
const photo = (key = 'photo', required = false): FieldDef => ({ key, kind: 'photo', required })
const list = (key: string, minItems: number, maxItems: number, required = false): FieldDef => ({
  key,
  kind: 'list',
  max: 120,
  minItems,
  maxItems,
  required,
})
const date = (key: string, required = false): FieldDef => ({ key, kind: 'date', required })

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  team: {
    id: 'team',
    group: 'people',
    formats: ['carousel', 'image', 'story'],
    fields: [photo(), text('name', 60, true), text('role', 80, true), area('bio', 400), text('funFact', 160)],
  },
  testimonial: {
    id: 'testimonial',
    group: 'people',
    formats: ['image', 'carousel', 'story'],
    fields: [
      area('quote', 600, true),
      text('author', 60, true),
      text('detail', 80),
      { key: 'rating', kind: 'rating' },
      photo(),
    ],
  },
  before_after: {
    id: 'before_after',
    group: 'people',
    formats: ['carousel', 'image', 'story'],
    fields: [photo('before', true), photo('after', true), text('title', 90, true), area('note', 400)],
  },
  case_study: {
    id: 'case_study',
    group: 'people',
    formats: ['carousel', 'image'],
    fields: [
      text('client', 80, true),
      area('problem', 240, true),
      area('solution', 240, true),
      text('result', 40, true),
      text('resultNote', 120),
      photo(),
    ],
  },
  behind_scenes: {
    id: 'behind_scenes',
    group: 'people',
    formats: ['carousel', 'story'],
    fields: [
      { key: 'photos', kind: 'photos', required: true, minItems: 1, maxItems: 6 },
      text('title', 90, true),
      area('text', 400),
    ],
  },
  quiz: {
    id: 'quiz',
    group: 'community',
    formats: ['carousel', 'story'],
    fields: [
      text('question', 140, true),
      list('answers', 2, 4, true),
      { key: 'correct', kind: 'choice', required: true },
      area('explanation', 240),
    ],
  },
  poll: {
    id: 'poll',
    group: 'community',
    formats: ['image', 'story'],
    fields: [text('question', 140, true), list('options', 2, 4, true)],
  },
  faq: {
    id: 'faq',
    group: 'community',
    formats: ['carousel'],
    fields: [text('title', 90), { key: 'pairs', kind: 'pairs', required: true, minItems: 1, maxItems: 5 }],
  },
  giveaway: {
    id: 'giveaway',
    group: 'community',
    formats: ['carousel', 'image'],
    fields: [
      text('prize', 90, true),
      list('steps', 1, 4, true),
      date('deadline', true),
      text('rules', 160),
      photo(),
    ],
  },
  offer: {
    id: 'offer',
    group: 'offer',
    formats: ['image', 'carousel', 'story'],
    fields: [
      text('headline', 90, true),
      text('discount', 16, true),
      area('details', 300),
      date('validUntil'),
      text('code', 30),
      text('terms', 160),
    ],
  },
  launch: {
    id: 'launch',
    group: 'offer',
    formats: ['carousel', 'image', 'story'],
    fields: [
      photo(),
      text('name', 80, true),
      area('description', 300, true),
      text('price', 30),
      text('where', 120),
    ],
  },
  price_list: {
    id: 'price_list',
    group: 'offer',
    formats: ['image', 'story'],
    fields: [
      text('title', 80, true),
      { key: 'prices', kind: 'prices', required: true, minItems: 1, maxItems: 8 },
      text('note', 140),
    ],
  },
  event: {
    id: 'event',
    group: 'offer',
    formats: ['image', 'carousel', 'story'],
    fields: [
      text('title', 90, true),
      date('date', true),
      { key: 'time', kind: 'time' },
      text('place', 100, true),
      area('description', 300),
      text('signup', 160),
      photo(),
    ],
  },
  milestone: {
    id: 'milestone',
    group: 'news',
    formats: ['image', 'carousel'],
    fields: [text('number', 20, true), text('title', 90, true), area('text', 300), photo()],
  },
  hiring: {
    id: 'hiring',
    group: 'news',
    formats: ['carousel', 'image'],
    fields: [
      text('position', 80, true),
      text('location', 80),
      list('offer', 0, 5),
      list('requirements', 0, 5),
      text('apply', 160, true),
      date('deadline'),
    ],
  },
  announcement: {
    id: 'announcement',
    group: 'news',
    formats: ['image', 'story'],
    fields: [text('title', 90, true), area('text', 300, true), text('dates', 80)],
  },
  award: {
    id: 'award',
    group: 'news',
    formats: ['image', 'carousel'],
    fields: [text('name', 90, true), text('issuer', 80, true), text('year', 4), area('text', 300), photo()],
  },
  partnership: {
    id: 'partnership',
    group: 'news',
    formats: ['image', 'carousel'],
    fields: [text('partner', 80, true), area('text', 300, true), photo()],
  },
}

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value)
}
