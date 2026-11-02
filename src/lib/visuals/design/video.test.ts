import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { configureFontLoader } from '../fonts'
import { renderOverlay } from './render'
import type { Slide } from './types'
import { clipPlan, sceneSeconds, videoScenes, videoStyleFor } from './video'

describe('video u temi', () => {
  it('kadrovi su naslovni slajdovi teme, najviše četiri, pa poziv na akciju', () => {
    const scenes = videoScenes([
      { kind: 'cover', title: 'Naslov' },
      { kind: 'point', title: 'Prva', body: 'Objašnjenje', items: ['x'], stat: '3x' },
      { kind: 'point', title: 'Druga' },
      { kind: 'point', title: 'Treća' },
      { kind: 'point', title: 'Četvrta' },
      { kind: 'cta', title: 'Pišite nam' },
    ])
    expect(scenes.map((s) => s.kind)).toEqual(['cover', 'cover', 'cover', 'cover', 'cta'])
    expect(scenes[1]).toMatchObject({ title: 'Prva', body: 'Objašnjenje', items: null, stat: null })
  })

  it('trajanje raste sa tekstom, a završni kadar je kraći', () => {
    expect(sceneSeconds({ kind: 'cover', title: 'Kratko' })).toBe(3)
    expect(sceneSeconds({ kind: 'cover', title: 'a'.repeat(60), body: 'b'.repeat(100) })).toBe(4.5)
    expect(sceneSeconds({ kind: 'cta', title: 'Pišite nam' })).toBe(2.5)
  })

  it('dva snimka dele kadrove, a kadar nastavlja snimak gde je prethodni stao', () => {
    expect(clipPlan([3, 3, 4, 2.5], 2)).toEqual([
      { clip: 0, start: 0 },
      { clip: 0, start: 3 },
      { clip: 1, start: 0 },
      { clip: 1, start: 4 },
    ])
    expect(clipPlan([3, 3], 0)).toEqual([
      { clip: null, start: 0 },
      { clip: null, start: 0 },
    ])
    expect(clipPlan([3, 3, 2.5], 1).map((c) => c.start)).toEqual([0, 3, 6])
  })

  it('tipografska tema i stil sa malom fotografijom idu preko snimka kao Poster, teme ostaju svoje', () => {
    expect(videoStyleFor('headline')).toBe('poster')
    for (const id of ['split', 'sticker', 'aurora', 'blocks', 'framed', 'poster'] as const)
      expect(videoStyleFor(id)).toBe(id)
    // krug, kartica i traka filma pokazivale bi snimak u uglu kadra (D-135)
    for (const id of ['pop', 'magazine', 'editorial', 'social', 'film'] as const)
      expect(videoStyleFor(id)).toBe('poster')
  })
})

describe('kadar videa preko celog ekrana (D-135)', () => {
  beforeAll(() => configureFontLoader({ remote: false }))

  /** Udeo kadra kroz koji se vidi snimak (sloj je providan ili poluprovidan). */
  async function videoShare(styleId: string, slide: Slide): Promise<number> {
    const r = await renderOverlay({
      styleId,
      slide,
      format: 'story',
      colors: {
        primary: '#990000',
        secondary: '#F26B1D',
        background: '#FFFFFF',
        text: '#111827',
        muted: '#6B7280',
      },
      brandFonts: { headings: 'Inter', body: 'Inter' },
      brandName: 'Brend',
      handle: '@brend',
      logo: null,
      index: 0,
      total: 1,
      video: true,
      outputWidth: 216,
    })
    const raw = await sharp(r.bytes).ensureAlpha().raw().toBuffer()
    let see = 0
    for (let i = 3; i < raw.length; i += 4) if (raw[i]! < 200) see++
    return see / (raw.length / 4)
  }

  it('u svakoj temi snimak zauzima bar tri četvrtine kadra, i u završnom kadru', async () => {
    const scene: Slide = {
      kind: 'cover',
      kicker: 'SEO',
      title: 'Upoređivanje rezultata nakon rada',
      body: 'Testovi.',
    }
    const end: Slide = { kind: 'cta', title: 'Pišite nam', body: 'Odgovaramo isti dan.' }
    for (const id of ['split', 'sticker', 'aurora', 'blocks', 'framed', 'poster']) {
      // bar tri četvrtine kadra je snimak, tekst u donjoj četvrtini (Nalepnica je pre D-135 imala 20 %)
      expect(await videoShare(id, scene), id).toBeGreaterThan(0.75)
      expect(await videoShare(id, end), `${id} kraj`).toBeGreaterThan(0.75)
    }
  }, 60_000)
})
