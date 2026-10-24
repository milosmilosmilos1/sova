import { describe, expect, it } from 'vitest'

import { readYouTubeOptions, youtubeOptionProblems, youtubeTitle } from './youtube'

describe('YouTube podešavanja', () => {
  it('privatnost podrazumevano javno; izjava za decu nema podrazumevanu vrednost', () => {
    expect(readYouTubeOptions({})).toEqual({ title: null, privacy: 'public', madeForKids: null })
    expect(readYouTubeOptions({ youtube: { privacy: 'secret', madeForKids: 'ne' } })).toMatchObject({
      privacy: 'public',
      madeForKids: null,
    })
  })

  it('naslov: podešavanje, pa naslov objave, pa prvi red teksta; najviše 100 znakova', () => {
    const o = readYouTubeOptions({})
    expect(youtubeTitle(o, null, 'Prvi red\nostatak')).toBe('Prvi red')
    expect(youtubeTitle(o, 'Naslov objave', 'tekst')).toBe('Naslov objave')
    expect(youtubeTitle(readYouTubeOptions({ youtube: { title: 'Moj naslov' } }), 'X', 'Y')).toBe(
      'Moj naslov',
    )
    expect(youtubeTitle(o, 'a'.repeat(150), '')).toHaveLength(100)
  })

  it('opis se meri u bajtovima (ćirilica zauzima dva), znaci < i > nisu dozvoljeni', () => {
    const ok = readYouTubeOptions({ youtube: { madeForKids: false } })
    expect(youtubeOptionProblems(ok, 'Naslov', 'ш'.repeat(2400))).toEqual([])
    expect(youtubeOptionProblems(ok, 'Naslov', 'ш'.repeat(2600)).join(' ')).toContain('5.000 bajtova')
    expect(youtubeOptionProblems(ok, 'A <b>', 'opis').join(' ')).toContain('< i >')
    expect(youtubeOptionProblems(readYouTubeOptions({}), 'Naslov', '').join(' ')).toContain('namenjen deci')
    expect(youtubeOptionProblems(ok, '', '').join(' ')).toContain('traži naslov')
  })
})
