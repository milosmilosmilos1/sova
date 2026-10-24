import { describe, expect, it } from 'vitest'

import { gbpDateTime, gbpOptionProblems, readGbpOptions } from './google-business'

describe('Google poslovni profil: podešavanja objave', () => {
  it('podrazumevano obična objava sa dugmetom „Saznajte više”; nepoznate vrednosti se ignorišu', () => {
    expect(readGbpOptions({})).toMatchObject({
      topicType: 'STANDARD',
      actionType: 'LEARN_MORE',
      ctaUrl: null,
    })
    expect(readGbpOptions({ google_business: { topicType: 'X', actionType: 'Y' } })).toMatchObject({
      topicType: 'STANDARD',
      actionType: 'LEARN_MORE',
    })
  })

  it('dugme traži link (osim poziva i bez dugmeta); link objave je dovoljan', () => {
    const o = readGbpOptions({ google_business: { actionType: 'BOOK' } })
    expect(gbpOptionProblems(o, null).join(' ')).toContain('traži link')
    expect(gbpOptionProblems(o, 'https://primer.rs')).toEqual([])
    expect(gbpOptionProblems(readGbpOptions({ google_business: { actionType: 'CALL' } }), null)).toEqual([])
    expect(gbpOptionProblems(readGbpOptions({ google_business: { actionType: 'NONE' } }), null)).toEqual([])
  })

  it('događaj i ponuda traže naslov, početak i kraj, i kraj posle početka', () => {
    const base = { topicType: 'EVENT', actionType: 'NONE' }
    expect(gbpOptionProblems(readGbpOptions({ google_business: base }), null)).toHaveLength(2)
    const reversed = readGbpOptions({
      google_business: {
        ...base,
        eventTitle: 'Dan',
        eventStart: '2026-11-07T16:00',
        eventEnd: '2026-11-07T10:00',
      },
    })
    expect(gbpOptionProblems(reversed, null)).toEqual(['Kraj događaja mora biti posle početka.'])
    const ok = readGbpOptions({
      google_business: {
        ...base,
        eventTitle: 'Dan',
        eventStart: '2026-11-07T10:00',
        eventEnd: '2026-11-08T10:00',
      },
    })
    expect(gbpOptionProblems(ok, null)).toEqual([])
  })

  it('lokalno vreme u Google datum i sat bez pretvaranja u UTC', () => {
    expect(gbpDateTime('2026-03-29T02:30')).toEqual({
      date: { year: 2026, month: 3, day: 29 },
      time: { hours: 2, minutes: 30, seconds: 0, nanos: 0 },
    })
  })
})
