import { describe, expect, it } from 'vitest'

import { conversationLocale, isInLocale } from './reply-language'

describe('jezik razgovora sa Sovom (D-156)', () => {
  it('poruka od bar tri reči koja se jasno prepoznaje, inače jezik aplikacije', () => {
    // ćirilica koja nije srpska (ukrajinski je uklonjen, D-173): ostaje jezik aplikacije
    expect(conversationLocale('зроби пост з анонсом акції', 'en')).toBe('en')
    expect(conversationLocale('Headline', 'en')).toBe('en')
    expect(conversationLocale('Promeni stil priče', 'en')).toBe('sr-Latn')
    expect(conversationLocale('Napravi karusel o servisu', 'en')).toBe('en')
    // srpska ćirilica: razgovor na srpskom (aplikacija nema srpsku ćirilicu)
    expect(conversationLocale('Направи објаву о сервису клима', 'en')).toBe('sr-Latn')
    expect(conversationLocale('Make a carousel about summer', 'sr-Latn')).toBe('sr-Latn')
  })

  it('pismo i slova: engleski bez srpskih reči i ćirilice', () => {
    expect(isInLocale('Зроблю сторіс для анонсу акції.', 'en')).toBe(false)
    expect(isInLocale('I will make a story for this sale.', 'en')).toBe(true)
    expect(isInLocale('Pravim karusel o servisu.', 'en')).toBe(false)
    expect(isInLocale('Pravim karusel o servisu.', 'sr-Latn')).toBe(true)
    expect(isInLocale('Направићу причу о акцији.', 'sr-Latn')).toBe(false)
    expect(isInLocale('', 'en')).toBe(true)
  })
})
