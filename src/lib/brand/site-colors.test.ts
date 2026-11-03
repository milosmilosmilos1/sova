import { describe, expect, it } from 'vitest'

import { profileColorChoices } from './site-colors'

describe('boje sa sajta za slike profila (D-148)', () => {
  it('tri prave boje sa sajta redom, bez skoro istih, sivih i belih', () => {
    expect(
      profileColorChoices({
        site: ['#ff6600', '#FF6A05', '#f5f5f5', '#003366', '#888888', '#22AA55', '#123456'],
        dark: '#111111',
        theme: ['#2563EB'],
      }),
    ).toEqual(['#FF6600', '#003366', '#22AA55'])
  })

  it('crno-beli sajt dobija tamnu boju sa sajta, pa boje teme', () => {
    expect(
      profileColorChoices({
        site: ['#ffffff', '#000000', null],
        dark: '#1A1A1A',
        theme: ['#990000', '#0F766E'],
      }),
    ).toEqual(['#1A1A1A', '#990000', '#0F766E'])
  })
})
