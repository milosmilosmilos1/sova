import { describe, expect, it } from 'vitest'

import { cleanDomain } from './demo-domain'

describe('adresa iz forme na landingu', () => {
  it('skida protokol, www, putanju i upit', () => {
    expect(cleanDomain('  https://www.Pekara-Zrno.rs/ponuda?x=1 ')).toBe('pekara-zrno.rs')
    expect(cleanDomain('http://moj.sajt.rs#kontakt')).toBe('moj.sajt.rs')
    expect(cleanDomain('vasafirma.rs')).toBe('vasafirma.rs')
  })

  it('prazan unos ostaje prazan, predugačak se seče na 40 znakova', () => {
    expect(cleanDomain('   ')).toBe('')
    expect(cleanDomain('a'.repeat(60) + '.rs')).toHaveLength(40)
  })
})
