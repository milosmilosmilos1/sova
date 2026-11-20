import { describe, expect, it } from 'vitest'

import { EMPTY_VOICE } from '@/lib/schemas/voice'

import { readinessFrom, readinessStep, stepReady } from './readiness'

const voice = {
  offer: 'Ugradnja klima uređaja.',
  audience: 'Vlasnici stanova.',
  tone: 'stručno',
  usp: 'Isti dan.',
  avoid: 'Bez cena.',
  cta: 'Pozovite nas.',
  topics: ['Saveti', 'Iza scene', 'Pitanja kupaca'],
}
const full = { brainSources: 1, voice, logo: true, colors: true, style: true }

describe('kompletan brend (D-174)', () => {
  it('sve stavke: kompletan, uvod na poslednjem koraku, svi koraci gotovi', () => {
    const r = readinessFrom(full)
    expect(r).toMatchObject({ complete: true, missing: [], missingVoice: [], topics: 3 })
    expect(readinessStep(r)).toBe(7)
    for (const step of ['welcome', 'networks', 'analysis', 'brand', 'colors', 'style', 'done'] as const)
      expect(stepReady(r, step)).toBe(true)
  })

  it('nov brend: fali sve, uvod počinje od analize', () => {
    const r = readinessFrom({ brainSources: 0, voice: null, logo: false, colors: false, style: false })
    expect(r.missing).toEqual(['brain', 'voice', 'topics', 'logo', 'colors', 'style'])
    expect(r.missingVoice).toEqual(['offer', 'audience', 'tone', 'usp', 'avoid', 'cta'])
    expect(readinessStep(r)).toBe(3)
    expect(stepReady(r, 'networks')).toBe(true)
    expect(stepReady(r, 'analysis')).toBe(false)
  })

  it('polje sa samo razmacima je prazno; dve teme nisu dovoljne', () => {
    const r = readinessFrom({ ...full, voice: { ...voice, usp: '   ', topics: ['A tema', 'B tema'] } })
    expect(r.missing).toEqual(['voice', 'topics'])
    expect(r.missingVoice).toEqual(['usp'])
    expect(readinessStep(r)).toBe(4)
    expect(readinessFrom({ ...full, voice: EMPTY_VOICE }).missingVoice).toHaveLength(6)
  })

  it('logo i boje su isti korak, stil sledeći', () => {
    expect(readinessStep(readinessFrom({ ...full, colors: false }))).toBe(5)
    expect(readinessStep(readinessFrom({ ...full, logo: false, style: false }))).toBe(5)
    expect(readinessStep(readinessFrom({ ...full, style: false }))).toBe(6)
    expect(stepReady(readinessFrom({ ...full, logo: false }), 'colors')).toBe(false)
  })
})
