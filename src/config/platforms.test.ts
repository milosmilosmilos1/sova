import { describe, expect, it } from 'vitest'

import { countTextLength, PLATFORM_KEYS, validateText } from './platforms'

describe('platforms', () => {
  it('ima ograničenja za svih 8 mreža', () => {
    expect(PLATFORM_KEYS).toHaveLength(8)
  })

  it('X broji URL kao 23 karaktera', () => {
    expect(countTextLength('x', 'Pogledajte https://sovaai.rs/neki/dugacak/put/ovde')).toBe(
      'Pogledajte '.length + 23,
    )
    expect(countTextLength('instagram', 'abc')).toBe(3)
  })

  it('prijavljuje predug tekst i previše hashtagova', () => {
    const long = 'a'.repeat(300)
    const r = validateText('x', long)
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toMatch(/280/)
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`)
    const ig = validateText('instagram', 'ok', tags)
    expect(ig.ok).toBe(false)
    expect(ig.problems[0]).toMatch(/30/)
  })

  it('prihvata ispravan tekst', () => {
    expect(validateText('linkedin', 'Kratka objava', ['#sova']).ok).toBe(true)
  })
})
