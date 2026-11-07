import { type Instrumentation } from 'next'

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

/**
 * Greške zahteva idu u Sentry samo kad je podešen, a paket (~1,5 MB) se učitava tek tada (D-164).
 * Ranije se učitavao na svakom hladnom startu i bez DSN-a.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
