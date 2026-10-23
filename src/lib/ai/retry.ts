/**
 * Retry sa eksponencijalnim backoff-om i jitter-om (brif 6.4):
 * najviše 3 pokušaja, pauze oko 1 s, 3 s, 9 s, samo za privremene greške.
 */
export interface RetryOptions {
  attempts?: number
  baseMs?: number
  factor?: number
  /** udeo nasumičnog odstupanja (0.3 = ±30 %) */
  jitter?: number
  shouldRetry: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

export function computeDelay(
  attempt: number,
  baseMs = 1000,
  factor = 3,
  jitter = 0.3,
  random: () => number = Math.random,
): number {
  const nominal = baseMs * factor ** (attempt - 1)
  const spread = nominal * jitter
  return Math.round(nominal - spread + random() * 2 * spread)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = options.attempts ?? 3
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !options.shouldRetry(error, attempt)) throw error
      const delay = computeDelay(attempt, options.baseMs, options.factor, options.jitter, options.random)
      options.onRetry?.(error, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastError
}
