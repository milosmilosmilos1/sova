import { describe, expect, it } from 'vitest'

import { findLink, productFromJsonLd } from '@/lib/studio/link'

import {
  buildStudioPrompt,
  normalizeStudioDecision,
  studioDecisionSchema,
  studioJsonSchema,
  type StudioDecision,
  type StudioPromptInput,
} from './studio'

/** Studio kao razgovor (D-116): upit, granice odluke modela i link iz poruke. */
const brief = {
  topic: 'Karusel o letnjem servisu klima uređaja sa pet saveta',
  format: 'carousel' as const,
  goal: 'education' as const,
  cta: null,
  locale: null,
  slides: null,
  style: null,
  photos: null,
  hashtags: true,
}

function decision(over: Partial<StudioDecision>): StudioDecision {
  return { action: 'reply', reply: 'U redu.', brief: null, revision: null, suggestions: [], ...over }
}

const ctx = {
  hasCurrent: true,
  editable: true,
  slideCount: 5,
  allowedFormats: ['image', 'carousel', 'video', 'story'] as const,
  hasPhotos: false,
}

function input(over: Partial<StudioPromptInput> = {}): StudioPromptInput {
  return {
    brand: {
      name: 'Klima Servis',
      locale: 'sr-Latn',
      address: 'vi',
      emoji: false,
      forbiddenWords: [],
      tone: 'jasan',
      description: 'Servis klima u Beogradu',
      facts: [],
    },
    brandLocale: 'sr-Latn',
    locale: null,
    platforms: ['instagram', 'facebook'],
    allowedFormats: ['image', 'carousel', 'video', 'story'],
    format: 'auto',
    styleName: 'Naslov i podnaslov',
    styles: [
      { id: 'headline', name: 'Naslov i podnaslov' },
      { id: 'quote', name: 'Citat' },
    ],
    history: [],
    current: null,
    photos: 0,
    link: null,
    message: 'Napravi karusel o letnjem servisu',
    today: '2026-10-30',
    ...over,
  }
}

describe('studio: odluka modela', () => {
  it('šema za Gemini je JSON šema bez $schema i prihvata sve tri radnje', () => {
    const schema = studioJsonSchema()
    expect(schema.$schema).toBeUndefined()
    expect(schema.type).toBe('object')
    for (const action of ['reply', 'create', 'revise'] as const)
      expect(studioDecisionSchema.safeParse(decision({ action })).success).toBe(true)
  })

  it('nova objava: vrsta koju mreže ne primaju postaje auto, slajdovi u granicama, fotografije u dizajn', () => {
    const out = normalizeStudioDecision(
      decision({ action: 'create', brief: { ...brief, format: 'link', slides: 14 }, suggestions: [] }),
      { ...ctx, hasPhotos: true, allowedFormats: [...ctx.allowedFormats] },
    )
    expect(out.action).toBe('create')
    expect(out.brief).toMatchObject({ format: 'auto', slides: 10, photos: 'in_design' })
    const noPhotos = normalizeStudioDecision(
      decision({ action: 'create', brief: { ...brief, photos: 'as_is' } }),
      { ...ctx, allowedFormats: [...ctx.allowedFormats] },
    )
    expect(noPhotos.brief!.photos).toBeNull()
  })

  it('nova objava bez brifa postaje odgovor sa napomenom', () => {
    const out = normalizeStudioDecision(decision({ action: 'create', brief: { ...brief, topic: ' x ' } }), {
      ...ctx,
      allowedFormats: [...ctx.allowedFormats],
    })
    expect(out).toMatchObject({ action: 'reply', brief: null, notes: ['brief_missing'] })
  })

  it('izmena: bez otvorene objave i na zakazanoj objavi postaje odgovor', () => {
    const revise = decision({
      action: 'revise',
      revision: { caption: 'Kraći opis', first_comment: null, slides: null },
    })
    const allowed = [...ctx.allowedFormats]
    expect(
      normalizeStudioDecision(revise, { ...ctx, allowedFormats: allowed, hasCurrent: false }).notes,
    ).toEqual(['revise_no_post'])
    expect(
      normalizeStudioDecision(revise, { ...ctx, allowedFormats: allowed, editable: false }).notes,
    ).toEqual(['revise_locked'])
    const ok = normalizeStudioDecision(revise, { ...ctx, allowedFormats: allowed })
    expect(ok).toMatchObject({ action: 'revise', revision: { caption: 'Kraći opis', slides: [] } })
    expect(ok.revision!.firstComment).toBeUndefined()
  })

  it('izmena slajdova: samo postojeći slajdovi, poslednja izmena istog slajda važi, prazan komentar se briše', () => {
    const out = normalizeStudioDecision(
      decision({
        action: 'revise',
        revision: {
          caption: null,
          first_comment: '  ',
          slides: [
            { index: 2, title: 'Prvo', body: null },
            { index: 9, title: 'Ne postoji', body: null },
            { index: 2, title: 'Drugi slajd', body: 'Novi tekst' },
            { index: 0, title: 'Nula', body: null },
          ],
        },
      }),
      { ...ctx, allowedFormats: [...ctx.allowedFormats] },
    )
    expect(out.revision).toEqual({
      caption: null,
      firstComment: null,
      slides: [{ index: 2, title: 'Drugi slajd', body: 'Novi tekst' }],
    })
    const locked = normalizeStudioDecision(
      decision({
        action: 'revise',
        revision: { caption: null, first_comment: null, slides: [{ index: 1, title: 'Novo', body: null }] },
      }),
      { ...ctx, allowedFormats: [...ctx.allowedFormats], slideCount: 0 },
    )
    expect(locked).toMatchObject({ action: 'reply', notes: ['slides_locked'] })
  })

  it('predlozi: bez praznih, duplih i navodnika, najviše tri', () => {
    const out = normalizeStudioDecision(
      decision({
        suggestions: ['„Skrati opis”', 'skrati opis', '- Napravi priču', '', 'Dodaj emoji', 'Četvrti'],
      }),
      { ...ctx, allowedFormats: [...ctx.allowedFormats] },
    )
    expect(out.suggestions).toEqual(['Skrati opis', 'Napravi priču', 'Dodaj emoji'])
  })
})

describe('studio: upit', () => {
  it('upit nosi brend, dozvoljene vrste, izabranu vrstu, jezik i poruku', () => {
    const prompt = buildStudioPrompt(input({ format: 'story', locale: 'en' }))
    expect(prompt).toContain('Naziv brenda: Klima Servis')
    expect(prompt).toContain('carousel (Karusel)')
    expect(prompt).toContain('izabrao vrstu story')
    expect(prompt).toContain('Jezik objava: engleski (izabrao korisnik)')
    expect(prompt).toContain('quote: Citat')
    expect(prompt).toContain('«Napravi karusel o letnjem servisu»')
    expect(prompt).toContain('Desno trenutno nije otvorena nijedna objava.')
  })

  it('otvorena objava daje slajdove za izmenu, a bez sačuvanog teksta slajdova kaže da se ne menjaju', () => {
    const current = {
      title: 'Leto bez znoja',
      format: 'carousel' as const,
      status: 'nacrt',
      editable: true,
      caption: 'Opis objave',
      firstComment: null,
      slides: [
        { title: 'Leto bez znoja', body: null },
        { title: 'Očistite filtere', body: 'Jednom mesečno.' },
      ],
    }
    const withSlides = buildStudioPrompt(input({ current }))
    expect(withSlides).toContain('Slajd 2: Očistite filtere | Jednom mesečno.')
    const without = buildStudioPrompt(input({ current: { ...current, slides: null } }))
    expect(without).toContain('tekst slajdova nije sačuvan')
  })

  it('istorija, link i fotografije idu u upit, link koji se nije otvorio se ne izmišlja', () => {
    const prompt = buildStudioPrompt(
      input({
        history: [
          { role: 'user', body: 'Zdravo' },
          { role: 'assistant', body: 'Evo karusela.', result: 'napravljena objava: Karusel' },
        ],
        link: {
          url: 'https://shop.test/klima',
          title: 'Klima 12000 BTU',
          description: 'Inverter',
          price: '45990 RSD',
          text: null,
          failed: false,
        },
        photos: 2,
      }),
    )
    expect(prompt).toContain('Sova: Evo karusela. [napravljena objava: Karusel]')
    expect(prompt).toContain('Cena: 45990 RSD')
    expect(prompt).toContain('priloženo 2 fotografije')
    const failed = buildStudioPrompt(
      input({
        link: {
          url: 'https://x.test',
          title: null,
          description: null,
          price: null,
          text: null,
          failed: true,
        },
      }),
    )
    expect(failed).toContain('ne izmišljaj njen sadržaj')
  })
})

describe('studio: link iz poruke', () => {
  it('nalazi prvi link, dodaje https za www i skida interpunkciju', () => {
    expect(findLink('Pogledaj https://shop.test/proizvod/123, super je.')).toBe(
      'https://shop.test/proizvod/123',
    )
    expect(findLink('Sajt: www.klima.rs/akcija!')).toBe('https://www.klima.rs/akcija')
    expect(findLink('Bez linka ovde')).toBeNull()
    expect(findLink('ftp://server.test/fajl')).toBeNull()
  })

  it('proizvod iz JSON-LD-a: naziv, opis i cena iz ponude ili raspona', () => {
    expect(
      productFromJsonLd([
        { '@type': 'Organization', name: 'Prodavnica' },
        {
          '@type': 'Product',
          name: 'Klima 12000 BTU',
          description: 'Inverter klima',
          offers: { '@type': 'Offer', price: 45990, priceCurrency: 'RSD' },
        },
      ]),
    ).toEqual({ name: 'Klima 12000 BTU', description: 'Inverter klima', price: '45990 RSD' })
    expect(
      productFromJsonLd([
        {
          '@type': ['Product'],
          name: 'Set',
          offers: [{ lowPrice: '10', highPrice: '20', priceCurrency: 'EUR' }],
        },
      ])!.price,
    ).toBe('10–20 EUR')
    expect(productFromJsonLd([{ '@type': 'WebPage' }])).toBeNull()
  })
})
