import { loadEnvLocal, TEST_SECRETS, UNSET_IN_TESTS } from '../env'

// Učitaj .env.local (lokalni Supabase ključevi) pre nego što se uveze src/lib/env.
loadEnvLocal()

// Spoljni servisi su u testovima uvek MSW mock. Pravi ključevi iz .env.local se namerno prepisuju:
// zahtev koji mock ne presretne otišao bi na pravi API, a sa lažnim ključem samo pada.
Object.assign(process.env, TEST_SECRETS)
for (const name of UNSET_IN_TESTS) delete process.env[name]
// faza 8b: LinkedIn sa odobrenim stranicama i analitikom, da se testira ceo tok
process.env.LINKEDIN_PAGES ||= 'true'
process.env.LINKEDIN_MEMBER_ANALYTICS ||= 'true'
process.env.PUBLIC_MEDIA_BASE_URL ||= 'https://media.sova.test'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Integracioni testovi traže pokrenut lokalni Supabase i .env.local (npm run db:start).')
}
