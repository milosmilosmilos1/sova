import { createHandler } from '@/lib/api/handler'
import { getViewerFromRequest } from '@/lib/auth/viewer'
import { configured, env, isPreview, isProd } from '@/lib/env'
import { getRedis } from '@/lib/ratelimit'

type CheckStatus = 'ok' | 'fail' | 'not_configured' | 'dev_fallback'
interface Check {
  status: CheckStatus
  latencyMs?: number
  detail?: string
}

async function timed(fn: () => Promise<Omit<Check, 'latencyMs'>>): Promise<Check> {
  const start = Date.now()
  try {
    const r = await fn()
    return { ...r, latencyMs: Date.now() - start }
  } catch (error) {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : 'greška',
    }
  }
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

async function checkDatabase(): Promise<Omit<Check, 'latencyMs'>> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { status: 'not_configured' }
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: withTimeout(3000),
    cache: 'no-store',
  })
  return res.ok ? { status: 'ok' } : { status: 'fail', detail: `HTTP ${res.status}` }
}

async function checkRedis(): Promise<Omit<Check, 'latencyMs'>> {
  const redis = getRedis()
  if (!redis) return { status: 'dev_fallback', detail: 'in-memory' }
  const pong = await redis.ping()
  return pong === 'PONG' ? { status: 'ok' } : { status: 'fail', detail: String(pong) }
}

async function checkInngest(): Promise<Omit<Check, 'latencyMs'>> {
  if (configured.inngestCloud) return { status: 'ok', detail: 'cloud keys present' }
  // na hostingu nema lokalnog dev servera (npr. režim pregleda, D-101)
  if (isProd) return { status: 'not_configured', detail: 'nema INNGEST_EVENT_KEY i INNGEST_SIGNING_KEY' }
  try {
    const res = await fetch('http://127.0.0.1:8288/health', { signal: withTimeout(1500), cache: 'no-store' })
    return res.ok
      ? { status: 'dev_fallback', detail: 'dev server' }
      : { status: 'fail', detail: `HTTP ${res.status}` }
  } catch {
    return { status: 'not_configured', detail: 'pokreni: npm run inngest:dev' }
  }
}

async function checkGemini(): Promise<Omit<Check, 'latencyMs'>> {
  if (!env.GEMINI_API_KEY) return { status: 'not_configured' }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_TEXT_MODEL)}`,
    { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: withTimeout(4000), cache: 'no-store' },
  )
  return res.ok
    ? { status: 'ok', detail: env.GEMINI_TEXT_MODEL }
    : { status: 'fail', detail: `HTTP ${res.status}` }
}

export const GET = createHandler(
  { auth: 'none', rateLimit: { name: 'health', limit: 60, windowSec: 60, by: 'ip' } },
  async ({ req }) => {
    const [database, redis, inngest, gemini] = await Promise.all([
      timed(checkDatabase),
      timed(checkRedis),
      timed(checkInngest),
      timed(checkGemini),
    ])
    const checks = { database, redis, inngest, gemini }
    const failed = Object.values(checks).some((c) => c.status === 'fail')
    const status = failed ? 'degraded' : 'ok'
    const time = new Date().toISOString()
    // u produkciji detalje (koji servisi rade) vidi samo admin platforme sa MFA
    if (isProd) {
      const viewer = await getViewerFromRequest(req, { real: true })
      if (viewer?.profile.platformRole !== 'platform_admin' || !viewer.mfaVerified) return { status, time }
    }
    return { status, env: env.NODE_ENV, preview: isPreview, time, checks }
  },
)
