import { loadEnvLocal, TEST_SECRETS, UNSET_IN_TESTS } from '../env'

// Živi testovi: Gemini je jedini pravi spoljni servis; mreže, plaćanje i pošta ostaju isključeni.
loadEnvLocal()
const key = process.env.GEMINI_API_KEY ?? ''
if (!key || key.startsWith('test-')) {
  throw new Error('Živi testovi traže pravi GEMINI_API_KEY u .env.local.')
}
for (const name of Object.keys(TEST_SECRETS)) if (name !== 'GEMINI_API_KEY') delete process.env[name]
for (const name of UNSET_IN_TESTS) delete process.env[name]

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Živi testovi traže pokrenut lokalni Supabase i .env.local (npm run db:start).')
}
