import { describe, expect, it, vi } from 'vitest'

import { computeDelay, withRetry } from './retry'

describe('retry', () => {
  it('pauze su oko 1 s, 3 s, 9 s sa jitter-om ±30 %', () => {
    expect(computeDelay(1, 1000, 3, 0.3, () => 0.5)).toBe(1000)
    expect(computeDelay(2, 1000, 3, 0.3, () => 0.5)).toBe(3000)
    expect(computeDelay(3, 1000, 3, 0.3, () => 0.5)).toBe(9000)
    expect(computeDelay(1, 1000, 3, 0.3, () => 0)).toBe(700)
    expect(computeDelay(1, 1000, 3, 0.3, () => 1)).toBe(1300)
  })

  it('ponavlja samo privremene greške i najviše 3 puta', async () => {
    const sleep = vi.fn(async () => {})
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw Object.assign(new Error('privremena'), { retryable: true })
        return 'ok'
      },
      { shouldRetry: (e) => (e as { retryable?: boolean }).retryable === true, sleep },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('trajna greška se ne ponavlja', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('trajna')
        },
        { shouldRetry: () => false, sleep: async () => {} },
      ),
    ).rejects.toThrow('trajna')
    expect(calls).toBe(1)
  })

  it('posle 3 neuspeha baca poslednju grešku', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error(`pokušaj ${calls}`)
        },
        { shouldRetry: () => true, sleep: async () => {} },
      ),
    ).rejects.toThrow('pokušaj 3')
  })
})
