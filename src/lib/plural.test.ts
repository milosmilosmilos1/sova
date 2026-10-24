import { describe, expect, it } from 'vitest'

import { pluralSr } from './plural'

const form = (n: number) => pluralSr(n, 'objava', 'objave', 'objava*')

describe('pluralSr', () => {
  it('1, 21, 101 → jednina; 11 → množina', () => {
    expect([1, 21, 101].map(form)).toEqual(['objava', 'objava', 'objava'])
    expect(form(11)).toBe('objava*')
  })

  it('2–4 i 22–24 → paukal; 12–14 → množina', () => {
    expect([2, 3, 4, 22, 34].map(form)).toEqual(['objave', 'objave', 'objave', 'objave', 'objave'])
    expect([12, 13, 14, 112].map(form)).toEqual(['objava*', 'objava*', 'objava*', 'objava*'])
  })

  it('0 i 5–20 → množina', () => {
    expect([0, 5, 10, 15, 20].map(form)).toEqual(['objava*', 'objava*', 'objava*', 'objava*', 'objava*'])
  })
})
