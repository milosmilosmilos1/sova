import { describe, expect, it } from 'vitest'

import { countTextLength, isSocialPlatform, PLATFORM_KEYS, validateText } from './platforms'

describe('platforms', () => {
  it('ima ograničenja za svih 7 mreža (bez X-a, D-192)', () => {
    expect(PLATFORM_KEYS).toHaveLength(7)
    expect(PLATFORM_KEYS).not.toContain('x')
  })

  it('broji znakove, ne bajtove', () => {
    expect(countTextLength('instagram', 'abc')).toBe(3)
    expect(countTextLength('instagram', 'šđ🦉')).toBe(3)
  })

  it('stari red sa x nije mreža koju Sova podržava', () => {
    expect(isSocialPlatform('x')).toBe(false)
    expect(isSocialPlatform('linkedin')).toBe(true)
    expect(isSocialPlatform(null)).toBe(false)
  })

  it('prijavljuje predug tekst i previše hashtagova', () => {
    const long = 'a'.repeat(300)
    const r = validateText('google_business', long.repeat(6))
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toMatch(/1500/)
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`)
    const ig = validateText('instagram', 'ok', tags)
    expect(ig.ok).toBe(false)
    expect(ig.problems[0]).toMatch(/30/)
  })

  it('prihvata ispravan tekst', () => {
    expect(validateText('linkedin', 'Kratka objava', ['#sova']).ok).toBe(true)
  })
})
