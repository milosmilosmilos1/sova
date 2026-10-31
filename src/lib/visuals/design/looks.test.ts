import { describe, expect, it } from 'vitest'

import { fontWidth, LOOK_FONTS } from './font-choices'
import { contrast, fit, withWidthScale } from './kit'
import { customColors, siteLooks, type SiteVisual } from './looks'

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

describe('izgled sa sajta (D-123)', () => {
  it('tri predloga u tri različita stila, sa fontovima sajta i čitljivim tekstom', () => {
    const looks = siteLooks(site)
    expect(looks.map((l) => l.id)).toEqual(['site-1', 'site-2', 'site-3'])
    expect(new Set(looks.map((l) => l.styleId)).size).toBe(3)
    for (const look of looks) {
      expect(look.fonts).toEqual({ headings: 'Montserrat', body: 'Open Sans' })
      expect(contrast(look.colors.text, look.colors.background)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('svetao na svetloj boji sajta, taman na tamnoj, treći u glavnoj boji brenda', () => {
    const [light, dark, solid] = siteLooks(site)
    expect(light!.colors.background).toBe('#F3F2F2')
    expect(light!.colors.primary).toBe('#990000')
    expect(dark!.colors.background).toBe('#201E1D')
    expect(contrast(dark!.colors.primary, dark!.colors.background)).toBeGreaterThanOrEqual(3)
    expect(solid!.colors.background).toBe('#990000')
    expect(contrast(solid!.colors.primary, solid!.colors.background)).toBeGreaterThanOrEqual(1.8)
  })

  it('boja iz šablona sajta (accent) ne ulazi u predloge kad boje brenda mogu', () => {
    const used = siteLooks(site).flatMap((l) => [l.colors.primary, l.colors.secondary])
    expect(used).not.toContain('#5CB85C')
    expect(used).toContain('#F26B1D')
  })

  it('sivkast sajt dobija živu boju, a pogrešna boja ne obara predloge', () => {
    const looks = siteLooks({ ...site, primary: '#666666', secondary: 'nije boja', accent: '#777777' })
    expect(looks[2]!.colors.background).not.toBe('#666666')
    for (const look of looks)
      expect(contrast(look.colors.text, look.colors.background)).toBeGreaterThanOrEqual(4.5)
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
