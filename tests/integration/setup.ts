import { readFileSync } from 'node:fs'
import path from 'node:path'

// Učitaj .env.local (lokalni Supabase ključevi) pre nego što se uveze src/lib/env.
try {
  const file = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of file.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1')
  }
} catch {
  // CI prosleđuje env direktno
}

// Spoljni servisi su u testovima uvek MSW mock. Pravi ključevi iz .env.local se namerno prepisuju:
// zahtev koji mock ne presretne otišao bi na pravi API, a sa lažnim ključem samo pada.
const TEST_SECRETS: Record<string, string> = {
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
Object.assign(process.env, TEST_SECRETS)
// bez ovih ključeva servisi rade lokalno ili se preskaču, isto kao u CI-ju
const UNSET_IN_TESTS = [
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
for (const name of UNSET_IN_TESTS) delete process.env[name]
// faza 8b: LinkedIn sa odobrenim stranicama i analitikom, da se testira ceo tok
process.env.LINKEDIN_PAGES ||= 'true'
process.env.LINKEDIN_MEMBER_ANALYTICS ||= 'true'
process.env.PUBLIC_MEDIA_BASE_URL ||= 'https://media.sova.test'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Integracioni testovi traže pokrenut lokalni Supabase i .env.local (npm run db:start).')
}
