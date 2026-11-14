import { describe, expect, it } from 'vitest'

import {
  beforeAfterInputSchema,
  contentItemIdSchema,
  contentKindsUpdateSchema,
  kindAvailability,
  kindState,
  storedContent,
  storedContentSchema,
  teamMemberInputSchema,
  testimonialInputSchema,
} from './brand-content'

const empty = () => storedContentSchema.parse({})
const uuid = '7b0c6f0e-2a55-4c4e-9f53-3a8f2a1d9c11'
const stamp = { id: 'a1b2c3d4e5', createdAt: '2026-11-14T10:00:00.000Z', usedAt: null }

describe('brand-content šeme (D-165)', () => {
  it('utisak: skraćuje razmake, podrazumevani izvor je lično, prazna polja postaju null', () => {
    const parsed = testimonialInputSchema.parse({
      author: '  Marija P. ',
      detail: '',
      text: '  Majstori su došli na vreme i ostavili čisto.  ',
    })
    expect(parsed).toEqual({
      author: 'Marija P.',
      detail: null,
      text: 'Majstori su došli na vreme i ostavili čisto.',
      rating: null,
      source: 'direct',
      date: null,
    })
  })

  it('utisak: odbija prekratak tekst, ocenu van 1–5 i loš datum', () => {
    expect(testimonialInputSchema.safeParse({ author: 'A', text: 'Kratko' }).success).toBe(false)
    expect(
      testimonialInputSchema.safeParse({ author: 'A', text: 'Dovoljno dug tekst', rating: 6 }).success,
    ).toBe(false)
    expect(
      testimonialInputSchema.safeParse({ author: 'A', text: 'Dovoljno dug tekst', date: '14.11.2026' })
        .success,
    ).toBe(false)
    expect(
      testimonialInputSchema.safeParse({ author: 'A', text: 'Dovoljno dug tekst', source: 'tiktok' }).success,
    ).toBe(false)
  })

  it('član tima: fotografija nije obavezna, ali mora biti UUID', () => {
    expect(teamMemberInputSchema.parse({ name: 'Nikola', role: 'Keramičar' }).photoAssetId).toBeNull()
    expect(
      teamMemberInputSchema.safeParse({ name: 'Nikola', role: 'Keramičar', photoAssetId: 'x' }).success,
    ).toBe(false)
  })

  it('pre i posle: obe fotografije su obavezne', () => {
    expect(beforeAfterInputSchema.safeParse({ title: 'Kupatilo', beforeAssetId: uuid }).success).toBe(false)
    expect(
      beforeAfterInputSchema.parse({ title: 'Kupatilo', beforeAssetId: uuid, afterAssetId: uuid }).note,
    ).toBeNull()
  })

  it('id stavke ima tačno deset malih slova ili cifara', () => {
    expect(contentItemIdSchema.safeParse('a1b2c3d4e5').success).toBe(true)
    expect(contentItemIdSchema.safeParse('A1B2C3D4E5').success).toBe(false)
    expect(contentItemIdSchema.safeParse('a1b2').success).toBe(false)
  })

  it('sačuvan sadržaj: prazan ili neispravan daje prazne liste, da strana ne padne', () => {
    expect(storedContent(null)).toEqual(empty())
    expect(storedContent({})).toEqual(empty())
    expect(storedContent({ content: 'nije objekat' })).toEqual(empty())
    expect(storedContent({ content: { testimonials: 'nije lista', kinds: 'x' } })).toEqual(empty())
  })

  it('sačuvan sadržaj: neispravna stavka ispada sama, ostale ostaju', () => {
    const good = { ...stamp, name: 'Nikola', role: 'Keramičar' }
    const content = storedContent({
      content: {
        kinds: { review: false },
        team: [good, { ...stamp, id: 'zzzzzzzzzz', name: 'Bez uloge' }],
        testimonials: [{ ...stamp, author: 'A' }],
      },
    })
    expect(content.team.map((m) => m.name)).toEqual(['Nikola'])
    expect(content.testimonials).toEqual([])
    expect(content.kinds).toEqual({ review: false })
  })

  it('sačuvan sadržaj: stara stavka bez usedAt dobija null', () => {
    const { usedAt: _, ...withoutUsed } = stamp
    const content = storedContent({
      content: { team: [{ ...withoutUsed, name: 'Nikola', role: 'Keramičar' }] },
    })
    expect(content.team[0]?.usedAt).toBeNull()
  })

  it('stanje vrste: nema ključa = auto, true = on, false = off', () => {
    const content = { ...empty(), kinds: { review: true, humor: false } }
    expect(kindState(content, 'review')).toBe('on')
    expect(kindState(content, 'humor')).toBe('off')
    expect(kindState(content, 'interactive')).toBe('auto')
  })

  it('dostupnost: vrste sa podacima traže podatke čak i kad su uključene', () => {
    const content = { ...empty(), kinds: { review: true, team: true, interactive: true } }
    expect(kindAvailability(content, 'review')).toBe('no')
    expect(kindAvailability(content, 'team')).toBe('no')
    expect(kindAvailability(content, 'interactive')).toBe('yes')
    expect(kindAvailability(content, 'humor')).toBe('auto')

    const withData = {
      ...content,
      testimonials: [
        {
          ...stamp,
          author: 'A',
          detail: null,
          text: 'Dovoljno dug tekst',
          rating: 5,
          source: 'google' as const,
          date: null,
        },
      ],
    }
    expect(kindAvailability(withData, 'review')).toBe('yes')
    expect(kindAvailability({ ...withData, kinds: { review: false } }, 'review')).toBe('no')
  })

  it('izmena prekidača prima samo auto, on i off', () => {
    expect(contentKindsUpdateSchema.safeParse({ kinds: { review: 'off', humor: 'auto' } }).success).toBe(true)
    expect(contentKindsUpdateSchema.safeParse({ kinds: { review: true } }).success).toBe(false)
  })
})
