import { describe, expect, it } from 'vitest'

import { CAPTION_RULES, captionParts, clipCaption, feedRatio, placementOf } from './preview'

const LONG =
  'Planirate team building, a niste sigurni koliki budžet da odvojite po zaposlenom? Troškovi zavise od formata događaja i broja ljudi, ali osnovna računica je jednostavna.'

describe('pregled objave na mreži (D-138)', () => {
  it('Instagram pokazuje oko 125 znakova ili dva reda, bez reči presečene na pola', () => {
    const { shown, cut } = clipCaption(LONG, CAPTION_RULES.instagram)
    expect(cut).toBe(true)
    expect(shown.length).toBeLessThanOrEqual(125)
    expect(LONG.startsWith(shown)).toBe(true)
    expect(LONG[shown.length]).toBe(' ')
    expect(clipCaption('Prvi red\nDrugi red\nTreći red', CAPTION_RULES.instagram)).toEqual({
      shown: 'Prvi red\nDrugi red',
      cut: true,
    })
    expect(clipCaption('Kratak opis ', CAPTION_RULES.instagram)).toEqual({ shown: 'Kratak opis', cut: false })
    // emodži na granici ostaje ceo
    const emoji = clipCaption(`${'a'.repeat(124)}🎉🎉`, CAPTION_RULES.instagram)
    expect(emoji.shown).toBe(`${'a'.repeat(124)}🎉`)
  })

  it('heštegovi, pominjanja i linkovi se izdvajaju; adresa e-pošte i „C#” ostaju tekst', () => {
    expect(captionParts('Pišite na ponuda@eventiko.rs ili @eventiko. #teambuilding #HR_srbija')).toEqual([
      { kind: 'text', value: 'Pišite na ponuda@eventiko.rs ili ' },
      { kind: 'mention', value: '@eventiko' },
      { kind: 'text', value: '. ' },
      { kind: 'tag', value: '#teambuilding' },
      { kind: 'text', value: ' ' },
      { kind: 'tag', value: '#HR_srbija' },
    ])
    expect(captionParts('Kurs C# i više na https://eventiko.rs/ponuda.')).toEqual([
      { kind: 'text', value: 'Kurs C# i više na ' },
      { kind: 'link', value: 'https://eventiko.rs/ponuda' },
      { kind: 'text', value: '.' },
    ])
    expect(captionParts('#događaji')).toEqual([{ kind: 'tag', value: '#događaji' }])
  })

  it('priča, vertikalni video ili feed, po mreži i medijima', () => {
    const image = { video: false, width: 1080, height: 1350 }
    const video = { video: true, width: 1080, height: 1920 }
    expect(placementOf('instagram', { format: 'story' }, [image])).toBe('story')
    expect(placementOf('facebook', { format: 'story' }, [image])).toBe('story')
    expect(placementOf('instagram', {}, [video])).toBe('vertical')
    expect(placementOf('instagram', {}, [image, image])).toBe('feed')
    expect(placementOf('tiktok', null, [image, image])).toBe('vertical')
    expect(placementOf('youtube', {}, [video])).toBe('vertical')
    expect(placementOf('facebook', {}, [video])).toBe('feed')
    expect(placementOf('linkedin', { format: 'story' }, [image])).toBe('feed')
    expect(placementOf('instagram', {}, [])).toBe('feed')
  })

  it('razmera u feedu ostaje u granicama mreže', () => {
    const tall = { video: false, width: 1080, height: 1920 }
    expect(feedRatio('instagram', tall)).toBe(0.8)
    expect(feedRatio('pinterest', { video: false, width: 1000, height: 1500 })).toBeCloseTo(2 / 3)
    expect(feedRatio('x', tall)).toBe(0.75)
    expect(feedRatio('facebook', { video: false, width: 1200, height: 628 })).toBeCloseTo(1.91, 2)
    expect(feedRatio('google_business', tall)).toBeCloseTo(4 / 3)
    expect(feedRatio('linkedin', undefined)).toBe(0.8)
  })
})
