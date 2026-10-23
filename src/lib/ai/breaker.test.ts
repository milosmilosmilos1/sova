import { describe, expect, it } from 'vitest'

import {
  CircuitBreaker,
  DEFAULT_BREAKER,
  evaluate,
  isOpen,
  MemoryBreakerStore,
  type BreakerState,
} from './breaker'

describe('circuit breaker', () => {
  it('ne otvara se ispod minimalnog broja poziva', () => {
    let s: BreakerState = { events: [], openUntil: 0 }
    s = evaluate(s, { t: 0, ok: false }, 0)
    s = evaluate(s, { t: 1, ok: false }, 1)
    s = evaluate(s, { t: 2, ok: false }, 2)
    expect(isOpen(s, 2)).toBe(false)
  })

  it('otvara se kad više od 50 % od bar 4 poziva padne, na 5 minuta', () => {
    let s: BreakerState = { events: [], openUntil: 0 }
    for (let i = 0; i < 3; i++) s = evaluate(s, { t: i, ok: false }, i)
    s = evaluate(s, { t: 3, ok: true }, 3)
    expect(isOpen(s, 3)).toBe(true)
    expect(isOpen(s, 3 + DEFAULT_BREAKER.openMs - 1)).toBe(true)
    expect(isOpen(s, 3 + DEFAULT_BREAKER.openMs + 1)).toBe(false)
  })

  it('događaji stariji od 2 minuta ispadaju iz prozora', () => {
    let s: BreakerState = { events: [], openUntil: 0 }
    for (let i = 0; i < 4; i++) s = evaluate(s, { t: i, ok: false }, i)
    const later = DEFAULT_BREAKER.windowMs + 10
    const after = evaluate({ events: s.events, openUntil: 0 }, { t: later, ok: true }, later)
    expect(after.events).toHaveLength(1)
    expect(isOpen(after, later)).toBe(false)
  })

  it('CircuitBreaker sa memorijskim store-om beleži i blokira', async () => {
    let now = 0
    const breaker = new CircuitBreaker(new MemoryBreakerStore(), DEFAULT_BREAKER, () => now)
    expect(await breaker.canCall('m')).toBe(true)
    for (let i = 0; i < 4; i++) {
      now = i
      await breaker.record('m', false)
    }
    expect(await breaker.canCall('m')).toBe(false)
    expect(await breaker.canCall('drugi')).toBe(true)
    now = DEFAULT_BREAKER.openMs + 100
    expect(await breaker.canCall('m')).toBe(true)
  })
})
