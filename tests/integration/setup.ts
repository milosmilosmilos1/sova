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

// Gemini se u testovima uvek mockuje (MSW); ključ služi samo da klijent bude "podešen".
process.env.GEMINI_API_KEY ??= 'test-gemini-key'
process.env.UNSPLASH_ACCESS_KEY ??= 'test-unsplash-key'
process.env.CANVA_CLIENT_ID ??= 'test-canva-client'
process.env.CANVA_CLIENT_SECRET ??= 'test-canva-secret-0123456789'
process.env.META_APP_ID ??= '1234567890123'
process.env.META_APP_SECRET ??= 'test-meta-app-secret-0123456789'
// faza 8b: LinkedIn (sa odobrenim stranicama i analitikom, da se testira ceo tok) i TikTok
process.env.LINKEDIN_CLIENT_ID ||= 'test-linkedin-client'
process.env.LINKEDIN_CLIENT_SECRET ||= 'test-linkedin-secret-0123456789'
process.env.LINKEDIN_PAGES ||= 'true'
process.env.LINKEDIN_MEMBER_ANALYTICS ||= 'true'
process.env.TIKTOK_CLIENT_KEY ||= 'test-tiktok-client-key'
process.env.TIKTOK_CLIENT_SECRET ||= 'test-tiktok-secret-0123456789'
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET ||= 'test-google-secret-0123456789'
process.env.PINTEREST_APP_ID ||= '1234567'
process.env.PINTEREST_APP_SECRET ||= 'test-pinterest-secret-0123456789'
process.env.PUBLIC_MEDIA_BASE_URL ||= 'https://media.sova.test'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Integracioni testovi traže pokrenut lokalni Supabase i .env.local (npm run db:start).')
}
