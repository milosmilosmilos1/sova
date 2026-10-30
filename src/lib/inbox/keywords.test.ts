import { describe, expect, it } from 'vitest'

import { cleanKeyword, matchesKeyword, normalizeText } from './keywords'

/** Ključne reči DM automatizacije (D-117). */
describe('ključne reči', () => {
  it('ćirilica, kvačice i velika slova daju istu reč', () => {
    expect(normalizeText('ЦЕНА')).toBe('cena')
    expect(normalizeText('Čćšžđ')).toBe('ccszdj')
    expect(normalizeText('Ціна')).toBe('cina')
  })

  it('reč mora da stoji sama, a ključna reč od više reči traži reči jednu do druge', () => {
    expect(matchesKeyword('Koja je cena?', ['cena'])).toBe('cena')
    expect(matchesKeyword('CENA', ['cena'])).toBe('cena')
    expect(matchesKeyword('Цена молим', ['cena'])).toBe('cena')
    expect(matchesKeyword('Pošaljite cenovnik', ['cena'])).toBeNull()
    expect(matchesKeyword('hoću  više   info', ['više info'])).toBe('više info')
    expect(matchesKeyword('info više', ['više info'])).toBeNull()
  })

  it('emoji kao ključna reč i čišćenje ključne reči', () => {
    expect(matchesKeyword('Super 🔥🔥', ['🔥'])).toBe('🔥')
    expect(cleanKeyword('  „#Cena” ')).toBe('Cena')
    expect(matchesKeyword('bilo šta', ['  '])).toBeNull()
  })
})
