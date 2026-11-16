import { describe, expect, it } from 'vitest'

import type { PostFormat } from '@/config/post-formats'
import { storedContentSchema, type StoredContent, type Testimonial } from '@/lib/schemas/brand-content'

import {
  applyReviewCopy,
  kindCopyLines,
  leadExcerpt,
  reviewQuoteBlock,
  reviewShortQuote,
  verbatimExcerpt,
} from './copy'
import {
  assignKinds,
  confirmKinds,
  KIND_FORMATS,
  pickRefs,
  resolveKind,
  slotKindOf,
  type SlotKind,
} from './index'

const empty = (): StoredContent => storedContentSchema.parse({})
const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`

function review(id: string, day: number, usedAt: string | null = null, text?: string): Testimonial {
  return {
    id,
    createdAt: at(day),
    usedAt,
    author: `Klijent ${id}`,
    detail: null,
    text: text ?? 'Majstori su došli na vreme i ostavili sve čisto.',
    rating: 5,
    source: 'google',
    date: null,
  }
}

// raspored iz plana: karusel i slika najčešće (lib/plans/slots.ts)
const ROTATION: PostFormat[] = ['carousel', 'image', 'video', 'carousel', 'story', 'image', 'text', 'link']
const month = (n: number) => Array.from({ length: n }, (_, i) => ROTATION[i % ROTATION.length]!)
// zadate vrste, bez predloga pitanja i humora na „Automatski”
const fixed = (kinds: Array<SlotKind | null>) =>
  kinds.filter((k): k is SlotKind => Boolean(k && !k.tentative))

describe('raspored vrsta u mesecu (D-165)', () => {
  it('bez podataka i sa svim vrstama na „Automatski”: samo predlozi pitanja i humora, oko jedan na deset', () => {
    const formats = month(31)
    const kinds = assignKinds({ formats, content: empty(), used: new Set() })
    const given = kinds.filter((k): k is SlotKind => Boolean(k))
    expect(given.every((k) => k.tentative && k.ref === null)).toBe(true)
    expect(given.filter((k) => k.kind === 'interactive')).toHaveLength(3)
    expect(given.filter((k) => k.kind === 'humor')).toHaveLength(3)
    kinds.forEach((k, i) => {
      if (k) expect(KIND_FORMATS[k.kind]).toContain(formats[i])
    })
    // sve isključeno: nema ničega
    const off = { ...empty(), kinds: { interactive: false, humor: false } }
    expect(assignKinds({ formats, content: off, used: new Set() }).every((k) => k === null)).toBe(true)
  })

  it('utisak i osoba idu na format koji ih nosi, po jedan na deset termina, najnovija stavka prva', () => {
    const content: StoredContent = {
      ...empty(),
      testimonials: [review('aaaaaaaaa1', 1), review('aaaaaaaaa2', 5)],
      team: [
        {
          id: 'bbbbbbbbb1',
          createdAt: at(2),
          usedAt: null,
          name: 'Nikola',
          role: 'Keramičar',
          bio: null,
          funFact: null,
          photoAssetId: null,
        },
      ],
    }
    const formats = month(13)
    const kinds = assignKinds({ formats, content, used: new Set() })
    const assigned = kinds.flatMap((k, i) => (k && !k.tentative ? [{ ...k, format: formats[i]! }] : []))
    expect(assigned.map((a) => a.kind).sort()).toEqual(['review', 'team'])
    for (const a of assigned) expect(KIND_FORMATS[a.kind]).toContain(a.format)
    expect(assigned.find((a) => a.kind === 'review')?.ref).toBe('aaaaaaaaa2')

    const big = assignKinds({ formats: month(30), content, used: new Set() })
    expect(big.filter((k) => k?.kind === 'review')).toHaveLength(2)
    expect(big.filter((k) => k?.kind === 'team')).toHaveLength(1)
  })

  it('stavka uzeta ranije u planu se ne ponavlja; kad nema novih, vrsta ne ide', () => {
    const content = { ...empty(), testimonials: [review('aaaaaaaaa1', 1)] }
    const kinds = assignKinds({ formats: month(13), content, used: new Set(['aaaaaaaaa1']) })
    expect(kinds.some((k) => k?.kind === 'review')).toBe(false)
  })

  it('redosled stavki: nekorišćene (novije prve), pa korišćene najdavnije', () => {
    const content = {
      ...empty(),
      testimonials: [
        review('aaaaaaaaa1', 1, at(20)),
        review('aaaaaaaaa2', 2),
        review('aaaaaaaaa3', 3, at(10)),
        review('aaaaaaaaa4', 4),
      ],
    }
    expect(pickRefs(content, 'review', new Set()).map((i) => i.id)).toEqual([
      'aaaaaaaaa4',
      'aaaaaaaaa2',
      'aaaaaaaaa3',
      'aaaaaaaaa1',
    ])
  })

  it('pre i posle ide samo na karusel', () => {
    const content = {
      ...empty(),
      pairs: [
        {
          id: 'ccccccccc1',
          createdAt: at(1),
          usedAt: null,
          title: 'Kupatilo',
          note: null,
          beforeAssetId: '7b0c6f0e-2a55-4c4e-9f53-3a8f2a1d9c11',
          afterAssetId: '7b0c6f0e-2a55-4c4e-9f53-3a8f2a1d9c12',
        },
      ],
    }
    const formats: PostFormat[] = ['image', 'text', 'image', 'carousel', 'story', 'image']
    expect(assignKinds({ formats, content, used: new Set() })[3]).toEqual({
      kind: 'before_after',
      ref: 'ccccccccc1',
    })
    expect(
      assignKinds({ formats: ['image', 'text', 'story'], content, used: new Set() }).some(
        (k) => k?.kind === 'before_after',
      ),
    ).toBe(false)
  })

  it('uključeno pitanje ide bez stavke i nije predlog; isključen humor nikad', () => {
    const on = { ...empty(), kinds: { interactive: true, humor: false } }
    const kinds = assignKinds({ formats: month(16), content: on, used: new Set() })
    expect(kinds.filter((k) => k?.kind === 'interactive')).toEqual([
      { kind: 'interactive', ref: null },
      { kind: 'interactive', ref: null },
    ])
    expect(kinds.some((k) => k?.kind === 'humor')).toBe(false)
    expect(fixed(kinds)).toHaveLength(2)
  })

  it('potvrda: zadata vrsta ostaje, predlog samo kad ga model potvrdi istom vrstom', () => {
    const assigned: Array<SlotKind | null> = [
      { kind: 'review', ref: 'aaaaaaaaa1' },
      { kind: 'humor', ref: null, tentative: true },
      { kind: 'interactive', ref: null, tentative: true },
      { kind: 'interactive', ref: null, tentative: true },
      { kind: 'interactive', ref: null },
      null,
    ]
    const proposed = new Map<number, string | null>([
      [0, null], // zadat utisak ostaje i bez potvrde
      [1, 'humor'], // potvrđen
      [2, null], // odbijen: obična objava
      [3, 'humor'], // pogrešna vrsta: obična objava
      [4, null], // uključeno: ostaje
      [5, 'humor'], // termin bez predloga: model ne dodaje vrstu
    ])
    expect(confirmKinds(assigned, proposed)).toEqual([
      { kind: 'review', ref: 'aaaaaaaaa1' },
      { kind: 'humor', ref: null },
      null,
      null,
      { kind: 'interactive', ref: null },
      null,
    ])
  })

  it('stavka u trenutku pravljenja: isključena vrsta, obrisana stavka ili stavka sa podacima', () => {
    const content = { ...empty(), testimonials: [review('aaaaaaaaa1', 1)] }
    expect(resolveKind(content, null)).toBeNull()
    expect(resolveKind(content, { kind: 'review', ref: 'zzzzzzzzzz' })).toEqual({ problem: 'missing' })
    expect(
      resolveKind({ ...content, kinds: { review: false } }, { kind: 'review', ref: 'aaaaaaaaa1' }),
    ).toEqual({
      problem: 'off',
    })
    expect(resolveKind(content, { kind: 'review', ref: 'aaaaaaaaa1' })).toMatchObject({
      target: { kind: 'review', item: { id: 'aaaaaaaaa1' } },
    })
    expect(resolveKind(content, { kind: 'humor', ref: null })).toEqual({ target: { kind: 'humor' } })
    // format koji vrsta sa podacima ne nosi (utisak kao video), a pitanje i humor idu uz svaki
    expect(resolveKind(content, { kind: 'review', ref: 'aaaaaaaaa1' }, 'video')).toEqual({
      problem: 'format',
    })
    expect(resolveKind(content, { kind: 'review', ref: 'aaaaaaaaa1' }, 'image')).toMatchObject({
      target: { kind: 'review' },
    })
    expect(resolveKind(content, { kind: 'humor', ref: null }, 'video')).toEqual({ target: { kind: 'humor' } })
  })

  it('vrsta iz sačuvanog termina: stari termin i neispravna vrednost daju null', () => {
    expect(slotKindOf({ date: '2026-12-01' })).toBeNull()
    expect(slotKindOf({ kind: 'reklama' })).toBeNull()
    expect(slotKindOf({ kind: 'team', ref: 'bbbbbbbbb1' })).toEqual({ kind: 'team', ref: 'bbbbbbbbb1' })
  })
})

describe('utisak klijenta: citat bez izmena (D-165)', () => {
  const s1 = 'Majstori su došli na vreme, završili kupatilo za dve nedelje i ostavili sve čisto.'
  const s2 = 'Preporučujem svima!'
  const s3 = 'Sledeće godine ih zovemo ponovo, ovaj put za kuhinju i hodnik, jer smo zaista zadovoljni.'
  const text = `${s1} ${s2} ${s3}`
  const lead = `${s1} ${s2}`

  it('doslovan izvod prolazi i vraća se sa pravopisom iz originala', () => {
    expect(text.length).toBeGreaterThan(140)
    expect(lead.length).toBeLessThanOrEqual(140)
    expect(verbatimExcerpt(text, '„majstori su došli na vreme, završili kupatilo za dve nedelje”')).toBe(
      'Majstori su došli na vreme, završili kupatilo za dve nedelje',
    )
    expect(verbatimExcerpt(text, 'ovaj put za kuhinju i hodnik')).toBe('ovaj put za kuhinju i hodnik')
  })

  it('prepričan, izmišljen, odsečen usred reči ili predug citat zamenjuje se početkom utiska', () => {
    expect(verbatimExcerpt(text, 'Najbolji majstori u gradu, sve pohvale!')).toBe(lead)
    expect(verbatimExcerpt(text, 'su došli na vreme, završili kupat')).toBe(lead)
    expect(verbatimExcerpt(text, text, 60)).toBe('Majstori su došli na vreme, završili kupatilo za dve…')
    expect(verbatimExcerpt(text, null)).toBe(lead)
  })

  it('početak utiska: cele rečenice do granice, inače seče na celoj reči', () => {
    expect(leadExcerpt('Kratko i jasno.', 140)).toBe('Kratko i jasno.')
    expect(leadExcerpt('Prva rečenica. Druga rečenica je duža od granice.', 20)).toBe('Prva rečenica.')
  })

  it('naslovni slajd, opis i kratka verzija za X', () => {
    const t = {
      ...review('aaaaaaaaa1', 1, null, text),
      detail: 'vlasnica stana na Vračaru',
      author: 'Marija P.',
    }
    const copy = applyReviewCopy(
      {
        slides: [
          {
            kind: 'cover' as const,
            kicker: 'Utisci',
            title: 'Sve pohvale za majstore!',
            body: 'x',
            stat: '5',
          },
          { kind: 'cta' as const, title: 'Zakažite procenu', body: null },
        ],
        caption: 'Hvala Mariji na poverenju. Zakažite procenu.',
        shortCaption: 'Izmišljen citat',
      },
      t,
      'sr-Latn',
    )
    expect(copy.slides[0]).toMatchObject({
      kind: 'cover',
      title: `„${lead}”`,
      body: '— Marija P., vlasnica stana na Vračaru',
      kicker: '5/5',
      stat: null,
    })
    expect(copy.slides[1]?.title).toBe('Zakažite procenu')
    expect(copy.caption.startsWith(reviewQuoteBlock(t, 'sr-Latn'))).toBe(true)
    expect(copy.caption).toContain(`„${text}”\n— Marija P., vlasnica stana na Vračaru · ★★★★★`)
    expect(copy.caption.endsWith('Hvala Mariji na poverenju. Zakažite procenu.')).toBe(true)
    expect(copy.shortCaption).toBe(reviewShortQuote(t, 'sr-Latn'))
    expect(copy.shortCaption.length).toBeLessThanOrEqual(280)
    expect(copy.shortCaption.endsWith('” — Marija P.')).toBe(true)
    expect(reviewQuoteBlock(t, 'uk').startsWith('«Majstori')).toBe(true)
  })

  it('uputstvo po vrsti nosi podatke između oznaka, a pitanje i humor ih nemaju', () => {
    const t = review('aaaaaaaaa1', 1)
    const lines = kindCopyLines({ kind: 'review', item: t }, 'designed').join('\n')
    expect(lines).toContain('<<<PODACI>>>')
    expect(lines).toContain(`Utisak: ${t.text}`)
    expect(lines).toContain('Ocena: 5/5')
    const humor = kindCopyLines({ kind: 'humor' }, 'text').join('\n')
    expect(humor).not.toContain('<<<PODACI>>>')
    expect(humor).toContain('tuđe memove')
  })
})
