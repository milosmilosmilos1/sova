import * as Sentry from '@sentry/nextjs'

/**
 * Pokreće se jednom pri startu servera. Validira env (aplikacija ne startuje
 * ako obavezna varijabla fali) i inicijalizuje Sentry kad postoji DSN.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env')
    if (process.env.SENTRY_DSN) await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge' && process.env.SENTRY_DSN) {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
