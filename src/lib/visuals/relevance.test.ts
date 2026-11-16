import { describe, expect, it } from 'vitest'

import { contentWords, textMatchesQuery } from './relevance'

describe('rezervna provera fotografije po opisu (D-167)', () => {
  it('značajne reči: bez kratkih, opštih reči i boja', () => {
    expect(contentWords('A close up photo of a white dog eating, 2 bowls')).toEqual([
      'dog',
      'eating',
      'bowls',
    ])
    expect(contentWords(null)).toEqual([])
  })

  it('mačka ne prolazi za objavu o psima', () => {
    expect(textMatchesQuery('a cat lying on the ground', 'dog food bowl')).toBe(false)
    expect(textMatchesQuery('a brown dog eating from a bowl', 'dog food bowl')).toBe(true)
  })

  it('množina i jednina su ista reč, a slični početci nisu', () => {
    expect(textMatchesQuery('two dogs playing in the park', 'dog')).toBe(true)
    expect(textMatchesQuery('puppies sleeping on a blanket', 'puppy food')).toBe(true)
    expect(textMatchesQuery('product category page', 'cat toys')).toBe(false)
  })

  it('boja ili opšta reč nije poklapanje', () => {
    expect(textMatchesQuery('a white cat on a sofa', 'white wedding dress')).toBe(false)
    expect(textMatchesQuery('close up photo of coffee beans', 'close up photo')).toBe(false)
  })

  it('bez opisa ili bez značajnih reči u upitu nema poklapanja', () => {
    expect(textMatchesQuery('', 'dog food')).toBe(false)
    expect(textMatchesQuery('dog', 'the and')).toBe(false)
  })
})
