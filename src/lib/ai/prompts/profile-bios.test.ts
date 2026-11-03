import { describe, expect, it } from 'vitest'

import {
  buildProfileBiosPrompt,
  clipText,
  normalizeProfileBios,
  PROFILE_FIELDS,
  PROFILE_PLATFORMS,
  type ProfileBios,
} from './profile-bios'

const empty = Object.fromEntries(PROFILE_PLATFORMS.map((p) => [p, {}])) as ProfileBios

describe('opisi profila po mreži (D-143)', () => {
  it('poštuje granice mreže bez presečene reči i emoji-ja', () => {
    expect(clipText('Adaptacija stanova po fiksnoj ceni u Beogradu', 20)).toBe('Adaptacija stanova')
    expect(clipText(`${'a'.repeat(29)}🏠🏠`, 30)).toBe(`${'a'.repeat(29)}🏠`)
    const out = normalizeProfileBios(
      {
        ...empty,
        instagram: {
          name: 'Adaptiko | Adaptacija stanova Beograd',
          short: 'x '.repeat(100),
          long: 'ne pripada',
        },
        tiktok: { name: 'Adaptiko', short: 'Kratko o nama' },
      },
      null,
    )
    expect(Array.from(out.instagram.name!).length).toBeLessThanOrEqual(PROFILE_FIELDS.instagram.name!)
    expect(Array.from(out.instagram.short!).length).toBeLessThanOrEqual(150)
    // polje koje mreža nema se ne čuva
    expect(out.instagram.long).toBeUndefined()
    expect(out.tiktok).toEqual({ name: 'Adaptiko', short: 'Kratko o nama' })
  })

  it('sajt ide u duži opis Facebooka, LinkedIna, YouTube-a i Pinteresta, a ne u opis Google profila', () => {
    const site = 'https://adaptiko.rs'
    const out = normalizeProfileBios(
      {
        ...empty,
        facebook: { short: 'Adaptacija stanova', long: 'Renoviramo stanove po fiksnoj ceni. '.repeat(10) },
        linkedin: { long: 'O nama, više na adaptiko.rs.' },
        google_business: {
          long: 'Adaptacija stanova u Beogradu. Posetite https://adaptiko.rs ili www.adaptiko.rs danas.',
        },
      },
      site,
    )
    expect(out.facebook.long!.endsWith(site)).toBe(true)
    expect(Array.from(out.facebook.long!).length).toBeLessThanOrEqual(255)
    // sajt koji već piše u opisu se ne dodaje drugi put
    expect(out.linkedin.long).toBe('O nama, više na adaptiko.rs.')
    expect(out.google_business.long).not.toMatch(/https?:|www\./)
  })

  it('ključne reči bez heštega i ponavljanja, do granice mreže', () => {
    const out = normalizeProfileBios(
      {
        ...empty,
        linkedin: {
          keywords: ['#Adaptacija stanova', 'adaptacija stanova', 'Renoviranje', ...Array(30).fill('x')],
        },
      },
      null,
    )
    expect(out.linkedin.keywords!.slice(0, 3)).toEqual(['Adaptacija stanova', 'Renoviranje', 'x'])
    expect(out.linkedin.keywords!.length).toBe(3)
  })

  it('prompt traži sajt samo kad postoji i poštuje izbor brenda za emoji', () => {
    const base = {
      brandName: 'Adaptiko',
      locale: 'sr-Latn' as const,
      address: 'vi' as const,
      profile: ['Opis: adaptacija'],
    }
    const withSite = buildProfileBiosPrompt({ ...base, website: 'https://adaptiko.rs', emoji: true })
    expect(withSite).toContain('Sajt: https://adaptiko.rs')
    expect(withSite).toContain('sa sajtom na kraju')
    expect(withSite).toContain('najviše 2 do 3')
    const noSite = buildProfileBiosPrompt({ ...base, website: null, emoji: false })
    expect(noSite).toContain('Sajt: nema')
    expect(noSite).not.toContain('sa sajtom na kraju')
    expect(noSite).toContain('bez emoji-ja (izbor brenda)')
  })
})
