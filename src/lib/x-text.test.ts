import { describe, expect, it } from 'vitest'

import { containsUrl, findUrls, xWeightedLength } from './x-text'

describe('xWeightedLength', () => {
  it('latinica i ćirilica 1, link 23 bez obzira na dužinu', () => {
    expect(xWeightedLength('Servis klime')).toBe(12)
    expect(xWeightedLength('Сервис климе')).toBe(12)
    expect(xWeightedLength('Vidi https://tangerineseo.rs/neki/veoma/dugacak/put?utm_source=x')).toBe(5 + 23)
  })

  it('domen bez https:// je takođe link (X ga sam povezuje)', () => {
    expect(xWeightedLength('Pišite na tangerineseo.rs danas')).toBe(
      'Pišite na '.length + 23 + ' danas'.length,
    )
  })

  it('emoji vredi 2, i cela ZWJ sekvenca; CJK znak 2', () => {
    expect(xWeightedLength('👍')).toBe(2)
    expect(xWeightedLength('👨‍👩‍👧')).toBe(2)
    expect(xWeightedLength('漢字')).toBe(4)
  })

  it('razloženo slovo (c + kvačica) posle NFC normalizacije vredi 1', () => {
    expect(xWeightedLength('č')).toBe(1)
  })
})

describe('containsUrl', () => {
  it('link, domen i port prepoznaje; email, verzije i skraćenice ne', () => {
    expect(containsUrl('https://sovaai.rs')).toBe(true)
    expect(containsUrl('posetite sovaai.rs/cene')).toBe(true)
    expect(findUrls('localhost.dev:8080/x')).toEqual(['localhost.dev:8080/x'])
    expect(containsUrl('pišite na ponuda@klima.rs')).toBe(false)
    expect(containsUrl('verzija 1.2 je izašla, npr. danas')).toBe(false)
  })
})
