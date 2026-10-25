import 'server-only'

import { configured, env, isPreview } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Cloudflare Turnstile provera. Kad ključevi nisu podešeni (DEV, D-014, ili režim pregleda, D-101),
 * provera prolazi uz upozorenje u logu. U pravoj produkciji su ključevi obavezni (env šema).
 */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!configured.turnstile) {
    if (env.NODE_ENV === 'production' && !isPreview) return false
    if (isPreview) logger.warn('turnstile_skipped_preview', { ip })
    return true
  }
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!data.success) logger.warn('turnstile_failed', { codes: data['error-codes'] })
    return Boolean(data.success)
  } catch (error) {
    logger.error('turnstile_error', { error })
    return false
  }
}
