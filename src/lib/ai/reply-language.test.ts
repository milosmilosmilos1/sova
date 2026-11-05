import { describe, expect, it } from 'vitest'

import { conversationLocale, isInLocale } from './reply-language'

describe('jezik razgovora sa Sovom (D-156)', () => {
  it('poruka od bar tri reči koja se jasno prepoznaje, inače jezik aplikacije', () => {
    expect(conversationLocale('зроби пост з анонсом акції', 'sr-Latn')).toBe('uk')
    expect(conversationLocale('Headline', 'uk')).toBe('uk')
    expect(conversationLocale('Promeni stil priče', 'uk')).toBe('sr-Latn')
    expect(conversationLocale('Napravi karusel o servisu', 'en')).toBe('en')
    // srpska ćirilica: razgovor na srpskom (aplikacija nema srpsku ćirilicu)
    expect(conversationLocale('Направи објаву о сервису клима', 'uk')).toBe('sr-Latn')
    expect(conversationLocale('Make a carousel about summer', 'sr-Latn')).toBe('sr-Latn')
  })

  it('pismo i slova: ukrajinski latinicom, srpski i poljski nisu ukrajinski', () => {
    expect(isInLocale('Зроблю сторіс для анонсу акції.', 'uk')).toBe(true)
    expect(isInLocale('Pripremiću story sa najavom akcije.', 'uk')).toBe(false)
    expect(isInLocale('Zroby shche odyn post', 'uk')).toBe(false)
    expect(isInLocale('Chętnie przygotuję story z zapowiedzią promocji', 'uk')).toBe(false)
    expect(isInLocale('Направићу причу о акцији.', 'uk')).toBe(false)
    expect(isInLocale('I will make a story for this sale.', 'en')).toBe(true)
    expect(isInLocale('Pravim karusel o servisu.', 'en')).toBe(false)
    expect(isInLocale('Pravim karusel o servisu.', 'sr-Latn')).toBe(true)
    expect(isInLocale('Зроблю пост у стилі Headline.', 'uk')).toBe(true)
    expect(isInLocale('', 'uk')).toBe(true)
  })
})
