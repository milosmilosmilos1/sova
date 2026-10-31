import { describe, expect, it } from 'vitest'

import { storedDesignSchema } from '@/lib/schemas/design'

import { fontWidth, LOOK_FONTS } from './font-choices'
import { contrast, fit, luminance, withWidthScale } from './kit'
import { customColors, LOOK_IDS, SITE_LOOK_STYLES, siteLooks, type SiteVisual } from './looks'

/** Sajt kao tangerineseo.rs: crvena i narandžasta su boje brenda, zelena je iz šablona sajta. */
const site: SiteVisual = {
  url: 'https://primer.rs/',
  at: '2026-10-31T10:00:00.000Z',
  source: 'site',
  primary: '#990000',
  secondary: '#F26B1D',
  accent: '#5CB85C',
  light: '#F3F2F2',
  dark: '#201E1D',
  headings: 'Montserrat',
  body: 'Open Sans',
}

/** Sajt kao belgrademidnight.rs: zlatna na crnoj, a druga boja sajta je skoro bela krem. */
const gold: SiteVisual = {
  ...site,
  primary: '#E3B662',
  secondary: '#FBF4E8',
  accent: '#F2DEB9',
  light: '#FBF4ED',
  dark: '#0E0C09',
  headings: 'Inter',
  body: 'Inter',
}

describe('teme sa sajta (D-123)', () => {
  it('tri svetle i tri tamne teme, svaka u svom stilu, sa fontovima sajta i čitljivim tekstom', () => {
    const looks = siteLooks(site)
    expect(looks.map((l) => l.id)).toEqual(['light-1', 'light-2', 'light-3', 'dark-1', 'dark-2', 'dark-3'])
    expect(looks.map((l) => l.styleId)).toEqual(
      LOOK_IDS.filter((id) => id !== 'custom').map((id) => SITE_LOOK_STYLES[id]),
    )
    for (const look of looks) {
      expect(look.fonts).toEqual({ headings: 'Montserrat', body: 'Open Sans' })
      expect(contrast(look.colors.text, look.colors.background)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('svetle teme su na svetloj podlozi, tamne na tamnoj, a naglasak se vidi na svojoj', () => {
    for (const visual of [site, gold]) {
      const looks = siteLooks(visual)
      for (const look of looks.slice(0, 3)) {
        expect(luminance(look.colors.background)).toBeGreaterThan(0.6)
        expect(contrast(look.colors.primary, look.colors.background)).toBeGreaterThanOrEqual(2.2)
      }
      for (const look of looks.slice(3)) {
        expect(luminance(look.colors.background)).toBeLessThan(0.2)
        expect(contrast(look.colors.primary, look.colors.background)).toBeGreaterThanOrEqual(1.8)
      }
    }
    const [classic, playful] = siteLooks(site)
    expect(classic!.colors.background).toBe('#F3F2F2')
    expect(classic!.colors.primary).toBe('#990000')
    expect(playful!.colors.background).toBe('#FFFFFF')
    // tamna boja brenda: tamnocrvena sa sajta je dovoljno tamna da bude podloga
    expect(siteLooks(site)[4]!.colors.background).toBe('#990000')
  })

  it('boja iz šablona sajta i skoro bela krem ne postaju naglasak', () => {
    const used = siteLooks(site).flatMap((l) => [l.colors.primary, l.colors.secondary])
    expect(used).not.toContain('#5CB85C')
    expect(used).toContain('#F26B1D')
    // zlatna je naglasak na tamnim temama, krem nije
    const dark = siteLooks(gold).slice(3)
    expect(dark[0]!.colors.primary).toBe('#E3B662')
    expect(dark.map((l) => l.colors.primary)).not.toContain('#FBF4E8')
  })

  it('sivkast sajt dobija živu boju, a pogrešna boja ne obara teme', () => {
    const looks = siteLooks({ ...site, primary: '#666666', secondary: 'nije boja', accent: '#777777' })
    expect(looks).toHaveLength(6)
    for (const look of looks)
      expect(contrast(look.colors.text, look.colors.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('oznake iz prve verzije (tri predloga) prevode se u nove teme', () => {
    expect(storedDesignSchema.parse({ look: 'site-2' }).look).toBe('dark-1')
    expect(storedDesignSchema.parse({ look: 'site-1' }).look).toBe('light-1')
    expect(storedDesignSchema.parse({ look: 'custom' }).look).toBe('custom')
  })
})

describe('sopstveni izgled (D-123)', () => {
  it('tercijalna boja je podloga, tekst se bira da bude čitljiv', () => {
    const light = customColors('#e11d48', '#0EA5E9', '#FEF3C7')
    expect(light).toMatchObject({ primary: '#E11D48', secondary: '#0EA5E9', background: '#FEF3C7' })
    expect(contrast(light.text, light.background)).toBeGreaterThanOrEqual(4.5)
    const dark = customColors('#FFD60A', '#FF006E', '#14213D')
    expect(dark.text).toBe('#ffffff')
    expect(customColors('x', 'y', 'z').background).toBe('#FFFFFF')
  })

  it('fontovi za izbor i širina slova za stil koji je podešen za drugi font', () => {
    expect(LOOK_FONTS).toContain('Montserrat')
    expect(new Set(LOOK_FONTS).size).toBe(LOOK_FONTS.length)
    expect(fontWidth('Oswald')).toBeLessThan(fontWidth('Unbounded'))
    expect(fontWidth('Nepoznat Font')).toBeCloseTo(0.57)
    const opts = { max: 120, min: 40, width: 900, height: 400, charWidth: 0.46 }
    const narrow = fit('Tri promene koje donose više upita', opts)
    const wide = withWidthScale(fontWidth('Unbounded') / fontWidth('Oswald'), () =>
      fit('Tri promene koje donose više upita', opts),
    )
    expect(wide).toBeLessThan(narrow)
    // posle crtanja procena je opet obična
    expect(fit('Tri promene koje donose više upita', opts)).toBe(narrow)
  })
})
