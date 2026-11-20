import { describe, expect, it } from 'vitest'

import { foreignSentences, isForeign, sentenceLanguage } from './content-language'

describe('jedan jezik u objavi', () => {
  it('prepoznaje jasno englesku i jasno srpsku rečenicu', () => {
    expect(sentenceLanguage('Book your table now and enjoy the night.')).toBe('en')
    expect(sentenceLanguage('Pozovite nas i zakažite termin za servis klime.')).toBe('sr')
    expect(sentenceLanguage('Позовите нас и закажите термин.')).toBe('sr')
  })

  it('imena, mesta, heštegovi i linkovi ne prave lažnu uzbunu', () => {
    // srpska rečenica sa engleskim nazivom brenda i heštegovima
    expect(sentenceLanguage('Happy hour u našem baru #BelgradeNightlife #CityGuide')).toBe('sr')
    // engleska rečenica sa srpskim mestom
    expect(sentenceLanguage('Dinner at Skadarlija, the old bohemian quarter of Belgrade.')).toBe('en')
    // kratko ili bez prepoznatih reči: ne zna se
    expect(sentenceLanguage('Belgrade after dark')).toBeNull()
    expect(sentenceLanguage('Klima24')).toBeNull()
    expect(sentenceLanguage('https://klima24.rs info@klima24.rs #klima @klima24 060 123 4567')).toBeNull()
    // reči oko linka ipak govore jezik
    expect(sentenceLanguage('Visit https://klima24.rs or email info@klima24.rs')).toBe('en')
  })

  it('strane rečenice u tekstu objave, po jeziku objave', () => {
    const mixed = 'Najbolji splavovi u Beogradu ove zime.\nBook your table now and skip the line!\n#beograd'
    expect(foreignSentences(mixed, 'sr-Latn')).toEqual(['Book your table now and skip the line!'])
    expect(
      foreignSentences('Discover the best clubs in Belgrade. Pozovite nas danas za rezervaciju.', 'en'),
    ).toEqual(['Pozovite nas danas za rezervaciju.'])
    expect(foreignSentences('Najbolji splavovi u Beogradu. Rezervišite sto na vreme.', 'sr-Latn')).toEqual([])
    expect(isForeign('Ready to grow your website visibility?', 'sr-Latn')).toBe(true)
    expect(isForeign('Ready to grow your website visibility?', 'en')).toBe(false)
    expect(isForeign('Pozovi +381616351596 ili nam piši na office@belgrademidnight.rs.', 'en')).toBe(true)
  })
})
