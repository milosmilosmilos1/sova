/**
 * Prijava greške u Sentry samo kad je podešen; paket se učitava tek tada (D-164). Radi i u
 * pregledaču (NEXT_PUBLIC_SENTRY_DSN) i na serveru (SENTRY_DSN). Bez DSN-a ne radi ništa.
 */
export async function reportError(error: unknown, tags?: Record<string, string>): Promise<void> {
  const dsn = typeof window === 'undefined' ? process.env.SENTRY_DSN : process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureException(error, tags ? { tags } : undefined)
  } catch {
    // prijava greške nikad ne obara odgovor
  }
}
