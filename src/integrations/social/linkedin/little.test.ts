import { describe, expect, it } from 'vitest'

import { toLittleText } from './little'

describe('LinkedIn little format', () => {
  it('escape-uje rezervisane znakove', () => {
    expect(toLittleText('Cena (popust) 20% za *sve*')).toBe('Cena \\(popust\\) 20% za \\*sve\\*')
    expect(toLittleText('pišite na info@sova.rs')).toBe('pišite na info\\@sova.rs')
    expect(toLittleText('a_b ~ c|d {x} [y] <z> \\')).toBe('a\\_b \\~ c\\|d \\{x\\} \\[y\\] \\<z\\> \\\\')
  })

  it('ostavlja hashtagove, ali ne i # posle slova ili ispred razmaka', () => {
    expect(toLittleText('#Beograd i #klima, (#servis)')).toBe('#Beograd i #klima, \\(#servis\\)')
    expect(toLittleText('C# programer')).toBe('C\\# programer')
    expect(toLittleText('# naslov')).toBe('\\# naslov')
    expect(toLittleText('#čišćenje klime')).toBe('#čišćenje klime')
  })

  it('običan tekst i URL bez rezervisanih znakova ostaju isti', () => {
    expect(toLittleText('Zakažite servis: https://sova.rs/servis?x=1')).toBe(
      'Zakažite servis: https://sova.rs/servis?x=1',
    )
  })
})
