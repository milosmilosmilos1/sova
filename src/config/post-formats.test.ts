import { describe, expect, it } from 'vitest'

import { formatFor, formatsForPlatforms, mediaNeed, mixedFormat, PLATFORM_FORMATS } from './post-formats'

describe('vrste objave (D-107)', () => {
  it('nudi samo vrste koje primaju sve izabrane mreže', () => {
    expect(formatsForPlatforms(['facebook'])).toEqual(['text', 'image', 'carousel', 'video', 'story', 'link'])
    expect(formatsForPlatforms(['facebook', 'instagram'])).toEqual(['image', 'carousel', 'video', 'story'])
    expect(formatsForPlatforms(['instagram', 'youtube'])).toEqual(['video'])
    expect(formatsForPlatforms(['youtube', 'google_business'])).toEqual([])
    expect(formatsForPlatforms([])).toHaveLength(6)
  })

  it('vrsta koja mreži ne odgovara prelazi u najbližu', () => {
    expect(formatFor('story', 'linkedin')).toBe('image')
    expect(formatFor('link', 'instagram')).toBe('image')
    expect(formatFor('text', 'instagram')).toBe('image')
    expect(formatFor('link', 'x')).toBe('link')
    expect(formatFor('image', 'youtube')).toBe('video')
    expect(formatFor('story', 'tiktok')).toBe('video')
    for (const [platform, formats] of Object.entries(PLATFORM_FORMATS))
      for (const f of formats) expect(formatFor(f, platform as keyof typeof PLATFORM_FORMATS)).toBe(f)
  })

  it('vizual po vrsti: priča i video vertikalno, karusel tri fotografije', () => {
    expect(mediaNeed('text')).toEqual({ kind: 'none' })
    expect(mediaNeed('carousel')).toEqual({ kind: 'image', count: 3, orientation: 'square' })
    expect(mediaNeed('story')).toEqual({ kind: 'image', count: 1, orientation: 'portrait' })
    expect(mediaNeed('video')).toEqual({ kind: 'video', orientation: 'portrait' })
  })

  it('AI meša dozvoljene vrste, slika i karusel češće', () => {
    const week = Array.from({ length: 6 }, (_, i) => mixedFormat(['image', 'video', 'story'], i))
    expect(week).toEqual(['image', 'image', 'video', 'story', 'image', 'image'])
    expect(mixedFormat([], 3)).toBeNull()
  })
})
