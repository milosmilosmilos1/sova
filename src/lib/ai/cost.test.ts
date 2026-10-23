import { describe, expect, it } from 'vitest'

import { DEFAULT_MODEL_PRICES } from '@/lib/tokens/prices'

import { estimateCostUsd } from './cost'

describe('estimateCostUsd', () => {
  it('tekst: ulaz i izlaz po milionu tokena, thinking se broji kao izlaz', () => {
    const cost = estimateCostUsd(DEFAULT_MODEL_PRICES['gemini-3.8-flash'], {
      inputTokens: 4000,
      outputTokens: 1000,
      thoughtTokens: 500,
    })
    // 4000/1M*0.75 + 1500/1M*3.75 = 0.003 + 0.005625
    expect(cost).toBeCloseTo(0.008625, 6)
  })

  it('slika: dodaje cenu po slici prema rezoluciji', () => {
    const p = DEFAULT_MODEL_PRICES['gemini-3.1-flash-image']
    expect(estimateCostUsd(p, { inputTokens: 0, outputTokens: 0, images: 1, imageSize: '1K' })).toBeCloseTo(
      0.067,
      6,
    )
    expect(estimateCostUsd(p, { inputTokens: 0, outputTokens: 0, images: 2, imageSize: '2K' })).toBeCloseTo(
      0.202,
      6,
    )
  })

  it('nepoznat model daje 0 umesto greške', () => {
    expect(estimateCostUsd(undefined, { inputTokens: 100, outputTokens: 100 })).toBe(0)
  })
})
