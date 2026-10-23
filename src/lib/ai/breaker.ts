/**
 * Circuit breaker po modelu (brif 6.4): ako u 2 minuta padne više od 50 %
 * poziva (uz bar 4 poziva), model se preskače 5 minuta.
 * Stanje je u Redisu kad postoji, inače u memoriji procesa.
 */
export interface BreakerEvent {
  t: number
  ok: boolean
}

export interface BreakerState {
  events: BreakerEvent[]
  openUntil: number
}

export interface BreakerConfig {
  windowMs: number
  openMs: number
  minCalls: number
  failureRatio: number
}

export const DEFAULT_BREAKER: BreakerConfig = {
  windowMs: 2 * 60_000,
  openMs: 5 * 60_000,
  minCalls: 4,
  failureRatio: 0.5,
}

/** Čista funkcija: novo stanje posle događaja. */
export function evaluate(
  state: BreakerState,
  event: BreakerEvent | null,
  now: number,
  cfg = DEFAULT_BREAKER,
): BreakerState {
  const events = state.events.filter((e) => now - e.t <= cfg.windowMs)
  if (event) events.push(event)
  let openUntil = state.openUntil
  if (events.length >= cfg.minCalls) {
    const failures = events.filter((e) => !e.ok).length
    if (failures / events.length > cfg.failureRatio && openUntil <= now) {
      openUntil = now + cfg.openMs
    }
  }
  return { events, openUntil }
}

export function isOpen(state: BreakerState, now: number): boolean {
  return state.openUntil > now
}

export interface BreakerStore {
  get(key: string): Promise<BreakerState | null>
  set(key: string, state: BreakerState, ttlMs: number): Promise<void>
}

export class MemoryBreakerStore implements BreakerStore {
  private map = new Map<string, BreakerState>()
  async get(key: string) {
    return this.map.get(key) ?? null
  }
  async set(key: string, state: BreakerState) {
    this.map.set(key, state)
  }
  clear() {
    this.map.clear()
  }
}

export class CircuitBreaker {
  constructor(
    private store: BreakerStore,
    private cfg: BreakerConfig = DEFAULT_BREAKER,
    private now: () => number = Date.now,
  ) {}

  private key(model: string) {
    return `sova:breaker:${model}`
  }

  async canCall(model: string): Promise<boolean> {
    const state = (await this.store.get(this.key(model))) ?? { events: [], openUntil: 0 }
    return !isOpen(state, this.now())
  }

  async record(model: string, ok: boolean): Promise<void> {
    const now = this.now()
    const state = (await this.store.get(this.key(model))) ?? { events: [], openUntil: 0 }
    const next = evaluate(state, { t: now, ok }, now, this.cfg)
    await this.store.set(this.key(model), next, Math.max(this.cfg.windowMs, this.cfg.openMs))
  }
}
