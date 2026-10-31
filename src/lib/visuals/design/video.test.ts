import { describe, expect, it } from 'vitest'

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

  it('tipografska tema ide preko snimka kao Poster', () => {
    expect(videoStyleFor('headline')).toBe('poster')
    expect(videoStyleFor('split')).toBe('split')
  })
})
