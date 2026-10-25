import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { configured, env, isPreview, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

export interface RateLimitOptions {
  limit: number
  windowSec: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  /** epoch ms kad se prozor resetuje */
  resetAt: number
}

let redisSingleton: Redis | null | undefined

/** Upstash Redis ili null kad nije podešen (dozvoljeno u DEV i u režimu pregleda, D-014, D-101). */
export function getRedis(): Redis | null {
  if (redisSingleton !== undefined) return redisSingleton
  if (configured.upstash) {
    redisSingleton = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! })
  } else {
    if (isProd && !isPreview) {
      throw new Error('UPSTASH_REDIS_REST_URL i UPSTASH_REDIS_REST_TOKEN su obavezni u produkciji.')
    }
    logger.warn('upstash_missing_using_memory', {
      hint: 'rate limit i lockovi rade u memoriji procesa (DEV ili pregled bez Upstash-a)',
    })
    redisSingleton = null
  }
  return redisSingleton
}

const limiters = new Map<string, Ratelimit>()

function upstashLimiter(redis: Redis, opts: RateLimitOptions): Ratelimit {
  const key = `${opts.limit}:${opts.windowSec}`
  let limiter = limiters.get(key)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSec} s`),
      prefix: 'sova:rl',
      analytics: false,
    })
    limiters.set(key, limiter)
  }
  return limiter
}

// ---- in-memory fallback (DEV i testovi) ----------------------------------

const memory = new Map<string, number[]>()
const MEMORY_MAX_KEYS = 10_000

export function memoryRateLimit(key: string, opts: RateLimitOptions, now = Date.now()): RateLimitResult {
  const windowMs = opts.windowSec * 1000
  const since = now - windowMs
  const hits = (memory.get(key) ?? []).filter((t) => t > since)
  if (hits.length >= opts.limit) {
    memory.set(key, hits)
    return { success: false, limit: opts.limit, remaining: 0, resetAt: hits[0]! + windowMs }
  }
  hits.push(now)
  memory.set(key, hits)
  if (memory.size > MEMORY_MAX_KEYS) {
    for (const [k, v] of memory) {
      if (v.every((t) => t <= since)) memory.delete(k)
      if (memory.size <= MEMORY_MAX_KEYS / 2) break
    }
  }
  return { success: true, limit: opts.limit, remaining: opts.limit - hits.length, resetAt: now + windowMs }
}

export function resetMemoryRateLimit(): void {
  memory.clear()
}

// ---- javni API -------------------------------------------------------------

export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedis()
  if (!redis) return memoryRateLimit(key, opts)
  const r = await upstashLimiter(redis, opts).limit(key)
  return { success: r.success, limit: r.limit, remaining: r.remaining, resetAt: r.reset }
}
