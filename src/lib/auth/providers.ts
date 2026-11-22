import 'server-only'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const TTL_MS = 5 * 60 * 1000
const RETRY_MS = 60 * 1000

let cache: { expires: number; google: boolean } | null = null

/**
 * Da li je prijava preko Google-a uključena u Supabase Auth.
 *
 * GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET služe vezi sa YouTube-om i Google Business-om
 * i ne znače da je Google uključen kao način prijave. Bez ove provere dugme vodi na
 * Supabase grešku „provider is not enabled”. Odgovor se pamti pet minuta.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  if (cache && Date.now() < cache.expires) return cache.google
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const body = (await res.json()) as { external?: { google?: unknown } }
    cache = { expires: Date.now() + TTL_MS, google: body.external?.google === true }
  } catch (error) {
    logger.warn('auth_settings_fetch_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    cache = { expires: Date.now() + RETRY_MS, google: false }
  }
  return cache.google
}
