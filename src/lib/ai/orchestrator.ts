import 'server-only'

import { CircuitBreaker, MemoryBreakerStore, type BreakerState, type BreakerStore } from '@/lib/ai/breaker'
import { estimateCostUsd, type Usage } from '@/lib/ai/cost'
import { AiError, classifyProviderError, isAiError } from '@/lib/ai/errors'
import { withRetry } from '@/lib/ai/retry'
import { logger } from '@/lib/logger'
import { getRedis } from '@/lib/ratelimit'
import { getModelPrices } from '@/lib/tokens/prices'

/**
 * Poziv modela sa retry logikom, circuit breaker-om i fallback lancem modela.
 * Safety blokada se nikad ne ponavlja i ne ide na fallback (brif 6.4).
 */
class RedisBreakerStore implements BreakerStore {
  async get(key: string): Promise<BreakerState | null> {
    const redis = getRedis()
    if (!redis) return null
    const raw = await redis.get<BreakerState | string>(key)
    if (!raw) return null
    return typeof raw === 'string' ? (JSON.parse(raw) as BreakerState) : raw
  }
  async set(key: string, state: BreakerState, ttlMs: number): Promise<void> {
    const redis = getRedis()
    if (!redis) return
    await redis.set(key, JSON.stringify(state), { px: ttlMs })
  }
}

let breakerSingleton: CircuitBreaker | null = null

export function getBreaker(): CircuitBreaker {
  if (!breakerSingleton) {
    breakerSingleton = new CircuitBreaker(getRedis() ? new RedisBreakerStore() : new MemoryBreakerStore())
  }
  return breakerSingleton
}

export function resetBreakerForTests(): void {
  breakerSingleton = null
}

export interface ModelCallOutcome<T> {
  result: T
  model: string
  fallbackUsed: boolean
  attempts: number
}

const NO_FALLBACK: ReadonlySet<string> = new Set(['SAFETY_BLOCKED', 'NOT_CONFIGURED', 'BAD_REQUEST'])

/**
 * Prolazi kroz lanac modela: za svaki pokuša do 3 puta (samo privremene greške),
 * beleži ishod u breaker; na trajnu grešku modela (404) ili iscrpljene pokušaje
 * prelazi na sledeći; SAFETY_BLOCKED i BAD_REQUEST prekidaju odmah.
 */
export async function callWithFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  options: { label: string; attempts?: number } = { label: 'ai' },
): Promise<ModelCallOutcome<T>> {
  const breaker = getBreaker()
  let lastError: AiError | null = null
  let attemptsTotal = 0

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!
    if (!(await breaker.canCall(model))) {
      logger.warn('ai_breaker_open_skip', { label: options.label, model })
      lastError = new AiError('CIRCUIT_OPEN', `Model ${model} je privremeno isključen posle niza grešaka.`, {
        model,
      })
      continue
    }
    try {
      const result = await withRetry(
        async (attempt) => {
          attemptsTotal++
          try {
            const r = await call(model)
            await breaker.record(model, true)
            return r
          } catch (error) {
            const ai = classifyProviderError(error, model)
            if (ai.code !== 'SAFETY_BLOCKED' && ai.code !== 'BAD_REQUEST') await breaker.record(model, false)
            logger.warn('ai_call_failed', {
              label: options.label,
              model,
              attempt,
              code: ai.code,
              status: ai.status,
            })
            throw ai
          }
        },
        {
          attempts: options.attempts ?? 3,
          shouldRetry: (error) => isAiError(error) && error.retryable,
        },
      )
      return { result, model, fallbackUsed: i > 0, attempts: attemptsTotal }
    } catch (error) {
      const ai = classifyProviderError(error, model)
      lastError = ai
      if (NO_FALLBACK.has(ai.code)) throw ai
      if (ai.code === 'MODEL_NOT_FOUND') {
        logger.error('ai_model_not_found', {
          label: options.label,
          model,
          hint: 'proveri GEMINI_*_MODEL u env-u',
        })
      }
    }
  }
  throw lastError ?? new AiError('PROVIDER_ERROR', 'Nijedan model nije dostupan.')
}

export async function costFor(model: string, usage: Usage): Promise<number> {
  const prices = await getModelPrices()
  return estimateCostUsd(prices[model], usage)
}
