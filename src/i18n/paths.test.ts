import { describe, expect, it } from 'vitest'

import { alternatesFor, detectLocale, isPublicPath, localePath, splitLocalePath } from './paths'

describe('jezik u adresi javnog sajta (D-130)', () => {
  it('putanja na jeziku: prefiks, engleska reč za kontakt, upit i sidro ostaju', () => {
    expect(localePath('sr-Latn', '/')).toBe('/')
    expect(localePath('en', '/')).toBe('/en')
    expect(localePath('uk', '/#pricing')).toBe('/uk#pricing')
    expect(localePath('en', '/kontakt')).toBe('/en/contact')
    expect(localePath('sr-Latn', '/kontakt')).toBe('/kontakt')
    expect(localePath('uk', '/login?next=/app/plan')).toBe('/uk/login?next=/app/plan')
    expect(localePath('en', '/invite/abc')).toBe('/en/invite/abc')
  })

  it('aplikacija i API nemaju prefiks', () => {
    expect(localePath('en', '/app')).toBe('/app')
    expect(localePath('uk', '/api/health')).toBe('/api/health')
    expect(isPublicPath('/app/plan')).toBe(false)
  })

  it('adresa sa prefiksom daje jezik i internu putanju', () => {
    expect(splitLocalePath('/en')).toEqual({ locale: 'en', path: '/' })
    expect(splitLocalePath('/uk/')).toEqual({ locale: 'uk', path: '/' })
    expect(splitLocalePath('/en/contact')).toEqual({ locale: 'en', path: '/kontakt' })
    expect(splitLocalePath('/uk/kontakt')).toEqual({ locale: 'uk', path: '/kontakt' })
    expect(splitLocalePath('/en/app')).toEqual({ locale: 'en', path: '/app' })
    expect(splitLocalePath('/kontakt')).toBeNull()
    expect(splitLocalePath('/english')).toBeNull()
  })

  it('kanonska adresa i hreflang za sva tri jezika', () => {
    expect(alternatesFor('en', '/kontakt')).toEqual({
      canonical: '/en/contact',
      languages: { sr: '/kontakt', en: '/en/contact', uk: '/uk/contact', 'x-default': '/kontakt' },
    })
  })

  it('prva poseta: region čita srpski, ukrajinski i engleski svoje, nepoznat jezik engleski', () => {
    expect(detectLocale(null)).toBe('sr-Latn')
    expect(detectLocale('sr-RS,sr;q=0.9,en;q=0.8')).toBe('sr-Latn')
    expect(detectLocale('hr-HR,hr;q=0.9')).toBe('sr-Latn')
    expect(detectLocale('uk-UA,uk;q=0.9,en;q=0.8')).toBe('uk')
    expect(detectLocale('ru-RU,ru;q=0.9,uk;q=0.8,en;q=0.7')).toBe('uk')
    expect(detectLocale('en-US,en;q=0.9')).toBe('en')
    expect(detectLocale('de-DE,de;q=0.9')).toBe('en')
    expect(detectLocale('en;q=0.5,uk;q=0.9')).toBe('uk')
  })
})
