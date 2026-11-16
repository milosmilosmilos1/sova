import { describe, expect, it } from 'vitest'

import { runBulk } from '@/components/shared/bulk'

import { buildMonthPlanPrompt, monthPlanJsonSchema, normalizeMonthPlan } from './month-plan'

/** Mesečni plan (D-119): upit, granice odgovora modela i radnja nad više stavki. */
const brand = {
  name: 'Klima Servis',
  locale: 'sr-Latn' as const,
  address: 'vi' as const,
  emoji: false,
  forbiddenWords: [],
  tone: 'jasan',
  description: 'Servis klima u Beogradu',
  facts: [],
}

describe('mesečni plan: upit', () => {
  it('upit nosi termine sa vrstom i mrežama, teme vlasnika, praznike, skorašnje objave i napomenu', () => {
    const prompt = buildMonthPlanPrompt({
      brand,
      locale: 'sr-Latn',
      monthLabel: 'novembar 2026.',
      slots: [
        {
          date: '2026-11-02',
          weekday: 'ponedeljak',
          format: 'carousel',
          platforms: ['instagram', 'facebook'],
        },
        { date: '2026-11-04', weekday: 'sreda', format: 'text', platforms: ['facebook'] },
      ],
      holidays: [{ date: '2026-11-11', name: 'Dan primirja' }],
      topics: ['Letnji servis'],
      pillars: ['Edukacija'],
      recent: ['Tri znaka da klima traži servis'],
      planned: ['Kako radi inverter klima'],
      notes: 'Akcija na čišćenje do 15. novembra',
      website: 'https://klima.test',
    })
    expect(prompt).toContain('plan objava za novembar 2026.')
    expect(prompt).toContain('0: 2026-11-02, ponedeljak, Karusel, Instagram + Facebook')
    expect(prompt).toContain('1: 2026-11-04, sreda, Samo tekst, Facebook')
    expect(prompt).toContain('- Letnji servis')
    expect(prompt).toContain('2026-11-11: Dan primirja')
    expect(prompt).toContain('- Tri znaka da klima traži servis')
    expect(prompt).toContain('TEME VEĆ U OVOM PLANU ZA RANIJE MESECE')
    expect(prompt).toContain('- Kako radi inverter klima')
    expect(prompt).toContain('Akcija na čišćenje do 15. novembra')
    expect(prompt).toContain('Karusel: saveti, koraci')
    expect(prompt).not.toContain('Link:')
    expect(monthPlanJsonSchema().$schema).toBeUndefined()
  })

  it('vrste sadržaja (D-165): termin nosi vrstu i stavku, podaci biznisa idu kao podaci, isključeno se poštuje', () => {
    const base = {
      brand,
      locale: 'sr-Latn' as const,
      monthLabel: 'decembar 2026.',
      holidays: [],
      topics: [],
      pillars: [],
      recent: [],
      notes: null,
      website: null,
    }
    const prompt = buildMonthPlanPrompt({
      ...base,
      slots: [
        {
          date: '2026-12-01',
          weekday: 'utorak',
          format: 'image',
          platforms: ['instagram'],
          kind: 'review',
          refLabel: 'U1',
        },
        {
          date: '2026-12-03',
          weekday: 'četvrtak',
          format: 'text',
          platforms: ['facebook'],
          kind: 'interactive',
          tentative: true,
        },
        { date: '2026-12-05', weekday: 'subota', format: 'image', platforms: ['facebook'] },
      ],
      kinds: {
        reviews: [
          { label: 'U1', author: 'Marija P.', detail: 'Vračar', rating: 5, text: 'Sve čisto i na vreme.' },
        ],
        team: [],
        pairs: [],
        off: ['humor'],
      },
    })
    expect(prompt).toContain('0: 2026-12-01, utorak, Slika, Instagram, VRSTA: utisak klijenta [U1]\n')
    expect(prompt).toContain(
      '1: 2026-12-03, četvrtak, Samo tekst, Facebook, VRSTA: pitanje za publiku (predlog)\n',
    )
    expect(prompt).toContain('2: 2026-12-05, subota, Slika, Facebook\n')
    expect(prompt).toContain('UTISCI KLIJENATA ZA OVAJ MESEC')
    expect(prompt).toContain('- [U1] Marija P., Vračar, ocena 5/5: Sve čisto i na vreme.')
    expect(prompt).not.toContain('LJUDI IZ TIMA')
    expect(prompt).toContain('Nikad ne izmišljaj utiske klijenata')
    // predlog: model ga potvrđuje vrstom ili odbija samo za ozbiljne delatnosti
    expect(prompt).toContain('Termin sa VRSTOM i oznakom (predlog)')
    expect(prompt).toContain('Odbij predlog samo kad vrsta stvarno ne priliči brendu')
    expect(prompt).toContain('Za termine bez oznake (predlog) kind je null.')
    expect(prompt).toContain('Bez humora i šala.')
    expect(prompt).not.toContain('pre i posle, atmosfera')
    // Gemini mora da vrati kind za svaki termin (null kad nema predloga)
    const schema = monthPlanJsonSchema() as {
      properties: { items: { items: { required: string[] } } }
    }
    expect(schema.properties.items.items.required).toContain('kind')

    // bez podataka biznisa: zabrana izmišljanja ostaje, model ne predlaže vrste
    const plain = buildMonthPlanPrompt({
      ...base,
      slots: [{ date: '2026-12-01', weekday: 'utorak', format: 'image', platforms: ['instagram'] }],
    })
    expect(plain).toContain('Nikad ne izmišljaj utiske klijenata')
    expect(plain).toContain('kind je uvek null.')
    expect(plain).not.toContain('VRSTA:')
  })

  it('odgovor: dupli slot važi prvi, nepoznat slot i ponovljena tema se preskaču, polja se skraćuju', () => {
    const map = normalizeMonthPlan(
      {
        items: [
          {
            slot: 0,
            topic: '„Tri saveta za leto”',
            brief: 'Opis.',
            goal: 'education',
            pillar: 'Edukacija',
            cta: null,
          },
          { slot: 0, topic: 'Drugi pokušaj', brief: '', goal: 'sales', pillar: '', cta: null },
          { slot: 1, topic: 'tri saveta za leto', brief: '', goal: 'engagement', pillar: '', cta: '  ' },
          { slot: 7, topic: 'Van liste', brief: '', goal: 'sales', pillar: '', cta: null },
          {
            slot: 2,
            topic: 'Pre i posle čišćenja',
            brief: 'x'.repeat(1200),
            goal: 'awareness',
            pillar: '',
            cta: 'Pišite nam',
          },
        ],
      },
      3,
    )
    expect([...map.keys()]).toEqual([0, 2])
    expect(map.get(0)).toMatchObject({ topic: 'Tri saveta za leto', pillar: 'Edukacija', goal: 'education' })
    expect(map.get(2)!.brief.length).toBe(1000)
    expect(map.get(2)).toMatchObject({ pillar: null, cta: 'Pišite nam' })
  })
})

describe('radnja nad više stavki', () => {
  it('radi sve stavke, broji uspešne i vraća poruke za neuspele', async () => {
    const seen: string[] = []
    const out = await runBulk(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        seen.push(id)
        if (id === 'c') throw new Error('Ne može.')
      },
      2,
    )
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(out).toEqual({ done: 3, failed: [{ id: 'c', message: 'Ne može.' }] })
    expect(await runBulk([], async () => undefined)).toEqual({ done: 0, failed: [] })
  })
})
