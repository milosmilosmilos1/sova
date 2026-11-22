import { describe, expect, it } from 'vitest'

import { alternatesFor, isPublicPath, localePath, splitLocalePath } from './paths'

describe('jezik u adresi javnog sajta (D-130)', () => {
  it('putanja na jeziku: prefiks, engleska reč za kontakt, upit i sidro ostaju', () => {
    expect(localePath('sr-Latn', '/')).toBe('/')
    expect(localePath('en', '/')).toBe('/en')
    expect(localePath('en', '/#pricing')).toBe('/en#pricing')
    expect(localePath('en', '/kontakt')).toBe('/en/contact')
    expect(localePath('sr-Latn', '/kontakt')).toBe('/kontakt')
    expect(localePath('en', '/login?next=/app/plan')).toBe('/en/login?next=/app/plan')
    expect(localePath('en', '/invite/abc')).toBe('/en/invite/abc')
  })

  it('aplikacija i API nemaju prefiks', () => {
    expect(localePath('en', '/app')).toBe('/app')
    expect(localePath('en', '/api/health')).toBe('/api/health')
    expect(isPublicPath('/app/plan')).toBe(false)
  })

  it('adresa sa prefiksom daje jezik i internu putanju', () => {
    expect(splitLocalePath('/en')).toEqual({ locale: 'en', path: '/' })
    expect(splitLocalePath('/en/')).toEqual({ locale: 'en', path: '/' })
    expect(splitLocalePath('/en/contact')).toEqual({ locale: 'en', path: '/kontakt' })
    // ukrajinski je uklonjen (D-173): /uk nije jezik, proxy ga preusmerava na /en
    expect(splitLocalePath('/uk/kontakt')).toBeNull()
    expect(splitLocalePath('/en/app')).toEqual({ locale: 'en', path: '/app' })
    expect(splitLocalePath('/kontakt')).toBeNull()
    expect(splitLocalePath('/english')).toBeNull()
  })

  it('kanonska adresa i hreflang za oba jezika', () => {
    expect(alternatesFor('en', '/kontakt')).toEqual({
      canonical: '/en/contact',
      languages: { sr: '/kontakt', en: '/en/contact', 'x-default': '/kontakt' },
    })
  })
})
