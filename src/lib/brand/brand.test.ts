import { describe, expect, it } from 'vitest'

import {
  aiOutputToFields,
  aiProfileOutputSchema,
  brandProfileJsonSchema,
  buildCorpus,
} from '@/lib/ai/prompts/brand-profile'

import { applyManualChanges, composeProfile, toBrandContext } from './compose'
import { buildHeuristicProfile, detectLocale, type HeuristicPage } from './heuristic'
import { brandProfileSchema, emptyProfile, FIELD_PATHS, getField, valueSchemaFor } from './profile-schema'

const page = (over: Partial<HeuristicPage>): HeuristicPage => ({
  url: 'https://fixture.test/',
  type: 'home',
  title: null,
  metaDescription: null,
  lang: 'sr',
  headings: { h1: [], h2: [], h3: [] },
  text: '',
  jsonLd: [],
  openGraph: {},
  socialLinks: {},
  publishedAt: null,
  ...over,
})

const pages: HeuristicPage[] = [
  page({
    title: 'Fixture Studio | Agencija',
    metaDescription: 'Agencija za SEO iz Beograda. Pomažemo vam da rastete.',
    headings: { h1: ['Rast koji se meri'], h2: [], h3: [] },
    text: 'Pomažemo vam da budete vidljivi. Preko 120 klijenata od 2015. godine veruje našem timu. Zakažite besplatne konsultacije. Vaš uspeh je naš posao.',
    jsonLd: [
      {
        '@type': 'Organization',
        name: 'Fixture Studio d.o.o.',
        email: 'info@fixture.test',
        telephone: '+381 11 123 4567',
        foundingDate: '2015-03-01',
        address: { streetAddress: 'Bulevar 1', addressLocality: 'Beograd', addressCountry: 'RS' },
      },
    ],
    openGraph: { 'og:site_name': 'Fixture Studio' },
    socialLinks: {
      facebook: 'https://www.facebook.com/fixture',
      instagram: 'https://www.instagram.com/fixture/',
    },
  }),
  page({
    url: 'https://fixture.test/usluge/',
    type: 'services',
    headings: {
      h1: ['Usluge'],
      h2: ['SEO optimizacija', 'Google oglasi', 'Društvene mreže', 'Kontakt'],
      h3: ['Pročitaj više'],
    },
    text: 'Paketi počinju od 150 € mesečno. Garancija povraćaja novca 30 dana.',
  }),
  page({
    url: 'https://fixture.test/blog/prvi-tekst/',
    type: 'blog_post',
    title: 'Kako da rangirate lokalno | Fixture',
    text: 'Dugačak tekst o lokalnom SEO-u. '.repeat(20),
    publishedAt: '2024-05-01T00:00:00.000Z',
  }),
]

describe('heuristic profile', () => {
  const profile = buildHeuristicProfile({
    brandName: 'Fixture',
    websiteUrl: 'https://fixture.test/',
    contentLocale: 'sr-Latn',
    pages,
    feedItems: [
      {
        url: 'https://fixture.test/blog/drugi/',
        title: 'Drugi tekst',
        publishedAt: '2024-06-01',
        summary: null,
      },
    ],
    visual: null,
    crawlId: null,
  })
  it('uzima naziv, kontakt, lokaciju i godinu iz JSON-LD', () => {
    expect(profile.identity.name.value).toBe('Fixture Studio d.o.o.')
    expect(profile.identity.name.confidence).toBeGreaterThan(0.8)
    expect(profile.contact.email.value).toBe('info@fixture.test')
    expect(profile.contact.phone.value).toBe('+381 11 123 4567')
    expect(profile.identity.location.value).toEqual({ city: 'Beograd', country: 'RS' })
    expect(profile.identity.founded_year.value).toBe(2015)
    expect(profile.identity.tagline.value).toBe('Rast koji se meri')
    expect(profile.identity.description.value).toContain('Agencija za SEO')
  })
  it('usluge iz naslova bez generičkih, cene i razlike', () => {
    expect(profile.offer.services.value.map((s) => s.name)).toEqual([
      'SEO optimizacija',
      'Google oglasi',
      'Društvene mreže',
    ])
    expect(profile.offer.price_hints.value[0]).toContain('150 €')
    expect(
      profile.offer.differentiators.value.some((d) => /120 klijenata|Garancija|besplatne/i.test(d)),
    ).toBe(true)
    expect(profile.facts.value.some((f) => f.claim.includes('120 klijenata'))).toBe(true)
  })
  it('mreže, blog, jezik i obraćanje', () => {
    expect(profile.social.value).toEqual({
      facebook: 'https://www.facebook.com/fixture',
      instagram: 'https://www.instagram.com/fixture/',
    })
    expect(profile.content.has_blog.value).toBe(true)
    expect(profile.content.recent_posts.value.map((p) => p.title)).toEqual([
      'Drugi tekst',
      'Kako da rangirate lokalno | Fixture',
    ])
    expect(profile.content.blog_topics.value[1]).toBe('Kako da rangirate lokalno')
    expect(profile.identity.content_locale.value).toBe('sr-Latn')
    expect(profile.voice.address.value).toBe('vi')
    expect(profile.meta.generated_by).toBe('heuristic')
    expect(brandProfileSchema.safeParse(profile).success).toBe(true)
  })
  it('detektuje ukrajinski po slovima і, ї, є, ґ (D-108)', () => {
    expect(
      detectLocale(
        [
          page({
            text: 'Ми допомагаємо бізнесу: їхні сайти стають видимими, а клієнти знаходять ґрунтовні відповіді. '.repeat(
              10,
            ),
          }),
        ],
        'sr-Latn',
      ).locale,
    ).toBe('uk')
  })
  it('detektuje ćirilicu i engleski', () => {
    expect(
      detectLocale(
        [page({ text: 'Ово је текст на ћирилици који је довољно дугачак да се препозна. '.repeat(10) })],
        'sr-Latn',
      ).locale,
    ).toBe('sr-Cyrl')
    expect(
      detectLocale(
        [
          page({
            lang: 'en',
            text: 'We help the businesses with our services and you can contact us about the work. '.repeat(
              10,
            ),
          }),
        ],
        'sr-Latn',
      ).locale,
    ).toBe('en')
  })
})

describe('compose', () => {
  const heuristic = buildHeuristicProfile({
    brandName: 'Fixture',
    websiteUrl: 'https://fixture.test/',
    contentLocale: 'sr-Latn',
    pages,
    feedItems: [],
    visual: null,
    crawlId: null,
  })
  it('AI prepisuje polja kad je siguran, sistemska polja ostaju heuristička', () => {
    const out = composeProfile({
      heuristic,
      ai: {
        'identity.description': {
          value: 'AI opis brenda.',
          confidence: 0.9,
          source_urls: ['https://fixture.test/'],
        },
        'voice.tone': { value: ['stručan', 'topao'], confidence: 0.2, source_urls: [] },
        social: { value: { tiktok: 'https://tiktok.com/@x' }, confidence: 0.9, source_urls: [] },
      },
      previous: null,
      lockedFields: [],
      meta: { generated_by: 'ai', model: 'test-model' },
    })
    expect(out.identity.description.value).toBe('AI opis brenda.')
    expect(out.voice.tone.value).toEqual(['stručan', 'topao']) // heuristika nema ton, pa i nesiguran AI prolazi
    expect(out.social.value.tiktok).toBeUndefined()
    expect(out.meta.model).toBe('test-model')
  })
  it('zaključana polja iz prethodne verzije ostaju, zabranjene reči se dopunjuju', () => {
    const previous = structuredClone(heuristic)
    previous.identity.description = { value: 'Ručni opis.', confidence: 1, source_urls: [] }
    previous.voice.forbidden_words = { value: ['jeftino'], confidence: 1, source_urls: [] }
    const out = composeProfile({
      heuristic,
      ai: {
        'identity.description': { value: 'AI opis.', confidence: 0.95, source_urls: [] },
        'voice.forbidden_words': { value: ['najbolji'], confidence: 0.6, source_urls: [] },
      },
      previous,
      lockedFields: ['identity.description'],
      meta: { generated_by: 'ai' },
    })
    expect(out.identity.description.value).toBe('Ručni opis.')
    expect(out.voice.forbidden_words.value.sort()).toEqual(['jeftino', 'najbolji'])
  })
  it('ručne izmene zaključavaju polja i prave validan profil', () => {
    const r = applyManualChanges(
      heuristic,
      [
        { path: 'voice.address', value: 'ti' },
        { path: 'facts', value: [{ claim: 'Radimo od 2015.', source_url: null }] },
      ],
      ['identity.name'],
    )
    expect(r.lockedFields).toEqual(['facts', 'identity.name', 'voice.address'])
    expect(r.profile.voice.address).toEqual({ value: 'ti', confidence: 1, source_urls: [] })
    expect(r.profile.meta.generated_by).toBe('manual')
    expect(valueSchemaFor('voice.address').safeParse('mi').success).toBe(false)
    expect(valueSchemaFor('facts').safeParse([{ claim: 'x', source_url: null }]).success).toBe(true)
  })
  it('kontekst za tekst spaja činjenice, razlike i garancije', () => {
    const ctx = toBrandContext(heuristic)
    expect(ctx.name).toBe('Fixture Studio d.o.o.')
    expect(ctx.facts.length).toBeGreaterThan(0)
    expect(ctx.services).toEqual(['SEO optimizacija', 'Google oglasi', 'Društvene mreže'])
    expect(ctx.address).toBe('vi')
  })
  it('prazan profil prolazi šemu i sve putanje imaju polje', () => {
    const empty = emptyProfile({ name: 'X', contentLocale: 'sr-Latn', websiteUrl: null })
    expect(brandProfileSchema.safeParse(empty).success).toBe(true)
    for (const p of FIELD_PATHS) expect(getField(empty, p)).toHaveProperty('confidence')
  })
})

describe('brand-profile prompt', () => {
  it('korpus stavlja važne strane prve, skraćuje blog i poštuje limit', () => {
    const { text, used } = buildCorpus(
      [
        { url: 'https://a.rs/blog/x', type: 'blog_post', title: 'Blog', text: 'b'.repeat(5000) },
        { url: 'https://a.rs/', type: 'home', title: 'Home', text: 'h'.repeat(500) },
        { url: 'https://a.rs/uslovi', type: 'legal', title: 'Uslovi', text: 'l'.repeat(500) },
      ],
      20_000,
    )
    expect(text.indexOf('https://a.rs/ (home)')).toBeLessThan(text.indexOf('https://a.rs/blog/x'))
    expect(text).not.toContain('uslovi')
    expect(text).toContain('[…]')
    expect(used).toBe(2)
  })
  it('JSON šema nema $schema, a izlaz se čisti u polja sa null vrednostima', () => {
    const schema = brandProfileJsonSchema()
    expect(schema.$schema).toBeUndefined()
    expect(schema.type).toBe('object')
    const sample = aiProfileOutputSchema.parse(JSON.parse(SAMPLE_AI))
    const fields = aiOutputToFields(sample)
    expect(fields['identity.tagline']?.value).toBeNull()
    expect(fields['identity.founded_year']?.value).toBeNull()
    expect(fields['voice.hashtags']?.value).toEqual(['#seo', '#beograd'])
    expect(fields['identity.location']?.value).toEqual({ city: 'Beograd', country: null })
    expect((fields.facts?.value as unknown[]).length).toBe(1)
  })
})

const f = (value: unknown, confidence = 0.8) => ({ value, confidence, source_urls: ['https://a.rs/'] })
export const SAMPLE_AI = JSON.stringify({
  identity: {
    name: f('Fixture Studio'),
    tagline: f(''),
    description: f('Opis.'),
    industry: f('Digitalni marketing'),
    city: f('Beograd'),
    country: f(''),
    founded_year: f(0),
    languages: f(['sr']),
  },
  offer: {
    services: f([{ name: 'SEO', description: 'Optimizacija' }]),
    products: f([]),
    differentiators: f(['120 klijenata']),
    price_hints: f([]),
    guarantees: f([]),
  },
  audience: {
    segments: f([{ name: 'Mali biznisi', description: '' }]),
    pain_points: f(['Nevidljivost']),
    market: f('b2b'),
  },
  voice: {
    tone: f(['stručan']),
    address: f('vi'),
    formality: f('neutral'),
    emoji: f(false),
    sample_phrases: f([]),
    key_terms: f(['SEO']),
    hashtags: f(['seo', '#beograd']),
    words_to_avoid: f(['najjeftinije']),
  },
  facts: f([
    { claim: 'Preko 120 klijenata od 2015.', source_url: 'https://a.rs/' },
    { claim: '   ', source_url: '' },
  ]),
  contact: { email: f('info@a.rs'), phone: f(''), address: f(''), working_hours: f('') },
  content: {
    blog_topics: f(['Lokalni SEO']),
    content_pillars: f([{ name: 'Edukacija', description: 'Saveti' }]),
  },
})
