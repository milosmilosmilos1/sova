import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Učitava .env.local u process.env; postojeće vrednosti ostaju (CI prosleđuje env direktno). */
export function loadEnvLocal(): void {
  try {
    const file = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of file.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1')
    }
  } catch {
    // nema .env.local
  }
}

/** Lažni ključevi spoljnih servisa za testove koji te servise mockuju (MSW). */
export const TEST_SECRETS: Record<string, string> = {
  GEMINI_API_KEY: 'test-gemini-key',
  UNSPLASH_ACCESS_KEY: 'test-unsplash-key',
  CANVA_CLIENT_ID: 'test-canva-client',
  CANVA_CLIENT_SECRET: 'test-canva-secret-0123456789',
  META_APP_ID: '1234567890123',
  META_APP_SECRET: 'test-meta-app-secret-0123456789',
  LINKEDIN_CLIENT_ID: 'test-linkedin-client',
  LINKEDIN_CLIENT_SECRET: 'test-linkedin-secret-0123456789',
  TIKTOK_CLIENT_KEY: 'test-tiktok-client-key',
  TIKTOK_CLIENT_SECRET: 'test-tiktok-secret-0123456789',
  // isti kao u CI-ju i u supabase/config.toml (Google prijava kroz env())
  GOOGLE_CLIENT_ID: 'test-google-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-google-secret-0123456789',
  PINTEREST_APP_ID: '1234567',
  PINTEREST_APP_SECRET: 'test-pinterest-secret-0123456789',
  X_CLIENT_ID: 'test-x-client-id',
  X_CLIENT_SECRET: 'test-x-client-secret-0123456789',
}

/** Bez ovih ključeva servisi rade lokalno ili se preskaču, isto kao u CI-ju. */
export const UNSET_IN_TESTS = [
  'FIRECRAWL_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'TURNSTILE_SECRET_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
]
