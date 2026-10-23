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

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Integracioni testovi traže pokrenut lokalni Supabase i .env.local (npm run db:start).')
}
