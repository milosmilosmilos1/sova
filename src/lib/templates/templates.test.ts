import { describe, expect, it } from 'vitest'

import { templateValuesSchema } from '@/lib/schemas/templates'

import { buildTemplate, clip, formatDay } from './build'
import { TEMPLATE_IDS, TEMPLATES, type TemplateId } from './catalog'
import { toCyrillic } from './phrases'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'

/** Najmanje ispravne vrednosti svakog šablona. */
export const SAMPLE: Record<TemplateId, Record<string, unknown>> = {
  team: {
    photo: P1,
    name: 'Marko',
    role: 'majstor za klime',
    bio: 'Radi kod nas od 2018.',
    funFact: 'Voli planine.',
  },
  testimonial: {
    quote: 'Majstori su došli na vreme i sve očistili.',
    author: 'Marija P.',
    detail: 'Vračar',
    rating: 5,
  },
  before_after: { before: P1, after: P2, title: 'Kupatilo, Vračar', note: 'Gotovo za šest dana.' },
  case_study: {
    client: 'Restoran u Novom Sadu',
    problem: 'Malo rezervacija radnim danima.',
    solution: 'Nov meni na Instagramu i objave tri puta nedeljno.',
    result: '+40%',
    resultNote: 'rezervacija za tri meseca',
  },
  behind_scenes: { photos: [P1, P2], title: 'Pripreme za venčanje', text: 'Ceo dan postavljamo salu.' },
  quiz: {
    question: 'Koliko često se čisti klima?',
    answers: ['Jednom godišnje', 'Dvaput godišnje'],
    correct: 1,
  },
  poll: { question: 'Kafa ili čaj?', options: ['Kafa', 'Čaj', ''] },
  faq: { pairs: [{ q: 'Da li dolazite vikendom?', a: 'Da, subotom do 15 h.' }] },
  giveaway: {
    prize: 'Servis klime',
    steps: ['Zapratite nas', 'Označite prijatelja'],
    deadline: '2026-12-15',
  },
  offer: { headline: 'Zimski servis', discount: '-20%', validUntil: '2026-12-31', code: 'ZIMA20' },
  launch: { name: 'Nova inverter klima', description: 'Tiša i štedljivija.', price: '49.900 din' },
  price_list: { title: 'Cene servisa', prices: [{ name: 'Čišćenje', price: '3.500 din' }] },
  event: { title: 'Dan otvorenih vrata', date: '2026-12-05', time: '18:00', place: 'Bulevar 1, Beograd' },
  milestone: { number: '10 godina', title: 'Deset godina sa vama', text: 'Počeli smo u garaži.' },
  hiring: {
    position: 'Serviser klima',
    location: 'Beograd',
    offer: ['Plata 120.000 din'],
    apply: 'Pošaljite CV na posao@firma.rs',
  },
  announcement: {
    title: 'Radno vreme za praznike',
    text: 'Od 31. decembra do 2. januara ne radimo.',
    dates: '31.12–2.1.',
  },
  award: { name: 'Najbolji servis 2026', issuer: 'Udruženje zanatlija', year: '2026' },
  partnership: { partner: 'Gorenje', text: 'Postali smo ovlašćeni servis.' },
}

const opts = { locale: 'sr-Latn' as const, cta: 'Pozovite 060 123 4567.' }

describe('šabloni koje biznis popunjava (D-175)', () => {
  it('svaki šablon u svakom svom obliku daje slajdove i opis sa upisanim podacima', () => {
    for (const id of TEMPLATE_IDS) {
      const values = templateValuesSchema(id).parse(SAMPLE[id])
      for (const format of TEMPLATES[id].formats) {
        const r = buildTemplate(id, values, { ...opts, format })
        expect(r.slides.length, `${id} ${format}`).toBeGreaterThan(0)
        if (format === 'image') expect(r.slides, `${id} ${format}`).toHaveLength(1)
        if (format === 'story') expect(r.slides.length, `${id} ${format}`).toBeLessThanOrEqual(3)
        for (const s of r.slides) expect(s.title.trim(), `${id} ${format}`).not.toBe('')
        expect(r.caption.length, `${id} ${format}`).toBeGreaterThan(5)
        expect(r.caption.length, `${id} ${format}`).toBeLessThanOrEqual(2200)
        expect(r.title.length).toBeLessThanOrEqual(200)
      }
    }
  })

  it('utisak se citira tačno kako je napisan, sa imenom i ocenom', () => {
    const values = templateValuesSchema('testimonial').parse(SAMPLE.testimonial)
    const r = buildTemplate('testimonial', values, { ...opts, format: 'image' })
    expect(r.slides[0]).toMatchObject({
      kicker: '5/5',
      title: '„Majstori su došli na vreme i sve očistili.”',
    })
    expect(
      r.caption.startsWith('„Majstori su došli na vreme i sve očistili.”\n— Marija P., Vračar · ★★★★★'),
    ).toBe(true)
    expect(r.photos).toEqual([])
  })

  it('pre i posle: karusel ima dve fotografije redom, a jedna slika traži spoj', () => {
    const values = templateValuesSchema('before_after').parse(SAMPLE.before_after)
    const carousel = buildTemplate('before_after', values, { ...opts, format: 'carousel' })
    expect(carousel.photos).toEqual([P1, P2])
    expect(carousel.slides.map((s) => s.kicker)).toEqual(['Pre', 'Posle', undefined])
    const image = buildTemplate('before_after', values, { ...opts, format: 'image' })
    expect(image.composite).toEqual({ before: P1, after: P2 })
    expect(image.caption).toContain('Levo je stanje pre, desno posle.')
  })

  it('kviz: odgovori sa slovima i tačan odgovor na sledećem slajdu; anketa bez prazne opcije', () => {
    const quiz = buildTemplate('quiz', templateValuesSchema('quiz').parse(SAMPLE.quiz), {
      ...opts,
      format: 'carousel',
    })
    expect(quiz.slides[0]!.items).toEqual(['A) Jednom godišnje', 'B) Dvaput godišnje'])
    // odgovori su i u tekstu slajda, red po red, da ih crta svaki stil
    expect(quiz.slides[0]!.body).toBe(
      ['A) Jednom godišnje', 'B) Dvaput godišnje'].join(String.fromCharCode(10)),
    )
    expect(quiz.slides[1]).toMatchObject({ kicker: 'Tačan odgovor', title: 'B) Dvaput godišnje' })
    const poll = buildTemplate('poll', templateValuesSchema('poll').parse(SAMPLE.poll), {
      ...opts,
      format: 'image',
    })
    expect(poll.slides[0]!.items).toEqual(['1. Kafa', '2. Čaj'])
    expect(poll.slides[0]!.body).toBe(['1. Kafa', '2. Čaj'].join(String.fromCharCode(10)))
    expect(poll.caption).toContain('Glasajte u komentarima')
  })

  it('provera unosa: obavezna polja, tačan odgovor mora postojati, najviše stavki', () => {
    expect(templateValuesSchema('team').safeParse({ role: 'majstor' }).success).toBe(false)
    expect(templateValuesSchema('quiz').safeParse({ ...SAMPLE.quiz, correct: 3 }).success).toBe(false)
    expect(
      templateValuesSchema('poll').safeParse({ question: 'Pitanje?', options: ['Samo jedna'] }).success,
    ).toBe(false)
    expect(
      templateValuesSchema('behind_scenes').safeParse({ ...SAMPLE.behind_scenes, photos: Array(7).fill(P1) })
        .success,
    ).toBe(false)
    expect(templateValuesSchema('event').safeParse({ ...SAMPLE.event, time: '25:00' }).success).toBe(false)
    expect(templateValuesSchema('team').parse({ name: 'Ana', role: 'dizajnerka' })).toMatchObject({
      photo: null,
      bio: '',
    })
  })

  it('ćirilica: stalne reči na ćirilici, a podaci kako su upisani', () => {
    const values = templateValuesSchema('offer').parse({
      ...SAMPLE.offer,
      headline: 'Zimski servis TangerineSEO',
    })
    const r = buildTemplate('offer', values, { ...opts, locale: 'sr-Cyrl', format: 'image' })
    expect(r.slides[0]!.kicker).toBe('Акција')
    // popust je u naslovu, jer istaknut broj crta samo stil „Statistika”
    expect(r.slides[0]!.title).toBe('Zimski servis TangerineSEO: -20%')
    expect(r.slides[0]!.body).toBe('Важи до 31. 12. 2026')
    expect(toCyrillic('Ljubav njuška džep, NJIVA')).toBe('Љубав њушка џеп, ЊИВА')
  })

  it('engleski i datumi', () => {
    const values = templateValuesSchema('event').parse(SAMPLE.event)
    const r = buildTemplate('event', values, { ...opts, locale: 'en', format: 'image' })
    expect(r.slides[0]!.kicker).toBe('5 December 2026 · 18:00')
    expect(formatDay('2026-12-05', 'sr-Latn')).toBe('5. 12. 2026')
    expect(clip('jedan dva tri četiri pet', 12)).toBe('jedan dva…')
  })
})
