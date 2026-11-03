import { describe, expect, it } from 'vitest'

import {
  buildExtrasPrompt,
  EXTRAS_LIMITS,
  extrasUsable,
  normalizeExtras,
  type ProfileExtras,
} from './profile-extras'

const base: ProfileExtras = {
  pinterest_boards: [
    { name: 'Ideje za adaptaciju malog stana u Beogradu i okolini', description: 'Pre i posle.' },
    { name: 'ideje za adaptaciju malog stana u beogradu i okolini', description: 'Ponovljena tabla.' },
    { name: ' ', description: 'Bez imena.' },
  ],
  youtube_playlists: [{ title: 'Pre i posle', description: 'Snimci završenih stanova.' }],
  youtube_trailer: {
    hook: 'Renovirate stan?',
    script: 'Ovde vidite\n\nkako radimo.',
    cta: 'Pretplatite se.',
  },
  google_services: [
    {
      name: 'Adaptacija stanova',
      description: 'Od projekta do ključa. Više na https://adaptiko.rs i www.adaptiko.rs',
    },
  ],
  ice_breakers: Array.from({ length: 6 }, (_, i) => ({ question: `Pitanje ${i}?`, answer: 'Pišite nam.' })),
  pinned_posts: [
    { title: 'Ko smo', why: 'Prvi utisak.', text: 'Adaptiko renovira stanove. 🏠' },
    { title: 'Prazna', why: '', text: '   ' },
  ],
}

describe('dodaci za profile po mreži (D-146)', () => {
  it('granice mreža, bez ponovljenih i praznih stavki, bez linkova u Google uslugama', () => {
    const x = normalizeExtras(base)
    expect(x.pinterest_boards).toHaveLength(1)
    expect(Array.from(x.pinterest_boards[0]!.name).length).toBeLessThanOrEqual(EXTRAS_LIMITS.boards.name)
    expect(x.google_services[0]!.description).not.toMatch(/https?:|www\./)
    expect(x.ice_breakers).toHaveLength(EXTRAS_LIMITS.iceBreakers.count)
    expect(x.pinned_posts.map((p) => p.title)).toEqual(['Ko smo'])
    // pasusi u tekstu za snimak ostaju
    expect(x.youtube_trailer.script).toBe('Ovde vidite\n\nkako radimo.')
    expect(extrasUsable(x)).toBe(true)
    expect(
      extrasUsable({
        ...x,
        pinterest_boards: [],
        youtube_playlists: [],
        google_services: [],
        ice_breakers: [],
      }),
    ).toBe(false)
  })

  it('prompt traži sajt u pozivu objava za vrh profila samo kad ga brend ima', () => {
    const input = {
      brandName: 'Adaptiko',
      locale: 'sr-Latn' as const,
      emoji: true,
      address: 'vi' as const,
      profile: ['Opis: adaptacija stanova'],
    }
    const withSite = buildExtrasPrompt({ ...input, website: 'https://adaptiko.rs' })
    expect(withSite).toContain('sa pozivom na akciju i sajtom')
    expect(withSite).toContain(`tačno ${EXTRAS_LIMITS.iceBreakers.count} pitanja`)
    expect(withSite).toContain('Emoji: samo u tekstu objava za vrh profila')
    expect(buildExtrasPrompt({ ...input, website: null })).not.toContain('i sajtom')
  })
})
