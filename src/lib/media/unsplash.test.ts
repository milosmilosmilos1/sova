import { describe, expect, it } from 'vitest'

import { photoCreditOf, unsplashDisplayUrl } from './unsplash'

const RAW = 'https://images.unsplash.com/photo-123?ixid=abc&ixlib=rb-4.0.3'

describe('Unsplash u prikazu (D-190)', () => {
  it('potpis iz sačuvane atribucije: ime i oba linka na unsplash.com', () => {
    const credit = photoCreditOf({
      provider: 'unsplash',
      text: 'Photo by Ana on Unsplash',
      photographerName: 'Ana',
      photographerUrl: 'https://unsplash.com/@ana?utm_source=sova&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=sova&utm_medium=referral',
    })
    expect(credit).toEqual({
      name: 'Ana',
      photographerUrl: 'https://unsplash.com/@ana?utm_source=sova&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=sova&utm_medium=referral',
    })
    // šablon čuva atribuciju bez polja provider, sa istim imenom i linkovima
    expect(
      photoCreditOf({
        text: 'Photo by Ana on Unsplash',
        photographerName: 'Ana',
        photographerUrl: 'https://unsplash.com/@ana',
        unsplashUrl: 'https://unsplash.com/',
      })?.name,
    ).toBe('Ana')
  })

  it('bez potpisa kad nema imena ili link ne vodi na unsplash.com', () => {
    expect(photoCreditOf(null)).toBeNull()
    expect(photoCreditOf({ text: 'Photo by Pexels' })).toBeNull()
    expect(
      photoCreditOf({
        photographerName: 'Ana',
        photographerUrl: 'javascript:alert(1)',
        unsplashUrl: 'https://unsplash.com/',
      }),
    ).toBeNull()
    expect(
      photoCreditOf({
        photographerName: ' ',
        photographerUrl: 'https://unsplash.com/@ana',
        unsplashUrl: 'https://unsplash.com/',
      }),
    ).toBeNull()
  })

  it('fotografija izabrana iz pretrage: hotlink na images.unsplash.com, ixid ostaje, ceo kadar', () => {
    const url = new URL(unsplashDisplayUrl({ urls: { raw: RAW } }, { width: 2000, height: 1333 })!)
    expect(url.origin).toBe('https://images.unsplash.com')
    expect(url.searchParams.get('ixid')).toBe('abc')
    expect(url.searchParams.get('w')).toBe('1080')
    expect(url.searchParams.get('fit')).toBe('max')
    expect(url.searchParams.get('h')).toBeNull()
    expect(url.searchParams.get('auto')).toBe('format')
  })

  it('raniji automatski isečak (kvadrat): ista veličina, isečak po sredini', () => {
    const url = new URL(
      unsplashDisplayUrl(
        { urls: { raw: RAW }, crop: 'square', focus: { x: 0.2, y: 0.8 } },
        { width: 1080, height: 1080 },
      )!,
    )
    expect(url.searchParams.get('w')).toBe('1080')
    expect(url.searchParams.get('h')).toBe('1080')
    expect(url.searchParams.get('fit')).toBe('crop')
    // sačuvani fokus je unutar isečka, pa se ne koristi kao fokus celog kadra
    expect(url.searchParams.get('crop')).toBeNull()
  })

  it('isečak iz editora celog kadra: isti odnos i centar kroz fokus; isečak isečka ide iz skladišta', () => {
    const url = new URL(
      unsplashDisplayUrl(
        {
          urls: { raw: RAW },
          crop: {
            aspect: 0.75,
            left: 400,
            top: 0,
            width: 1000,
            height: 1333,
            sourceWidth: 2000,
            sourceHeight: 1333,
            fromFull: true,
          },
        },
        { width: 1000, height: 1333 },
      )!,
    )
    expect(url.searchParams.get('w')).toBe('1000')
    expect(url.searchParams.get('h')).toBe('1333')
    expect(url.searchParams.get('fit')).toBe('crop')
    expect(url.searchParams.get('crop')).toBe('focalpoint')
    expect(url.searchParams.get('fp-x')).toBe('0.45')
    expect(url.searchParams.get('fp-y')).toBe('0.5')
    // isečak isečka i stari zapis bez veličine izvora ne mogu da se ponove sa Unsplash adrese
    expect(
      unsplashDisplayUrl(
        {
          urls: { raw: RAW },
          crop: { left: 0, top: 0, width: 10, height: 10, sourceWidth: 20, sourceHeight: 20 },
        },
        { width: 10, height: 10 },
      ),
    ).toBeNull()
    expect(
      unsplashDisplayUrl(
        { urls: { raw: RAW }, crop: { aspect: 1, left: 0, top: 0, width: 10, height: 10 } },
        { width: 10, height: 10 },
      ),
    ).toBeNull()
  })

  it('bez Unsplash adrese nema hotlinka', () => {
    expect(
      unsplashDisplayUrl({ urls: { raw: 'https://example.com/a.jpg' } }, { width: 10, height: 10 }),
    ).toBeNull()
    expect(unsplashDisplayUrl(null, { width: null, height: null })).toBeNull()
  })
})
