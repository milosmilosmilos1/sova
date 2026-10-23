import { beforeEach, describe, expect, it } from 'vitest'

import { memoryRateLimit, resetMemoryRateLimit } from './ratelimit'

describe('memoryRateLimit', () => {
  beforeEach(() => resetMemoryRateLimit())

  it('dozvoljava do limita pa odbija', () => {
    const now = 1_000_000
    const opts = { limit: 3, windowSec: 60 }
    expect(memoryRateLimit('k', opts, now).success).toBe(true)
    expect(memoryRateLimit('k', opts, now + 1).success).toBe(true)
    const third = memoryRateLimit('k', opts, now + 2)
    expect(third.success).toBe(true)
    expect(third.remaining).toBe(0)
    const fourth = memoryRateLimit('k', opts, now + 3)
    expect(fourth.success).toBe(false)
    expect(fourth.resetAt).toBe(now + 60_000)
  })

  it('posle isteka prozora ponovo dozvoljava', () => {
    const now = 1_000_000
    const opts = { limit: 1, windowSec: 10 }
    memoryRateLimit('k2', opts, now)
    expect(memoryRateLimit('k2', opts, now + 5_000).success).toBe(false)
    expect(memoryRateLimit('k2', opts, now + 10_001).success).toBe(true)
  })

  it('ključevi su nezavisni', () => {
    const opts = { limit: 1, windowSec: 10 }
    expect(memoryRateLimit('a', opts, 0).success).toBe(true)
    expect(memoryRateLimit('b', opts, 0).success).toBe(true)
  })
})
