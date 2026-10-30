// Provera env-a pre build-a na Netlify-ju. Server validira promenljive tek pri startu, pa bi deploy
// bez obavezne tajne izašao kao sajt koji pada na svakoj strani. Ovako pada build, a živi sajt
// ostaje na prethodnom deploy-u. Ispisuje samo imena promenljivih, nikad vrednosti.
// Pokretanje: node --experimental-strip-types scripts/check-env.mjs (netlify.toml)

import { parseServerEnv } from '../src/lib/env.schema.ts'

// deploy preview i branch deploy nemaju produkcijske tajne (kontekst „production”)
if (process.env.CONTEXT && process.env.CONTEXT !== 'production') {
  console.log(`provera env-a: preskočena za kontekst ${process.env.CONTEXT}`)
  process.exit(0)
}

const mode = process.env.SOVA_PREVIEW === 'true' ? 'preview' : 'prod'
try {
  parseServerEnv({ ...process.env, NODE_ENV: 'production' }, mode)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

// servisi koji u pregledu smeju da fale (D-101): samo imena, da se u logu build-a vidi šta radi
const services = {
  gemini: ['GEMINI_API_KEY'],
  inngest: ['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'],
  upstash: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  resend: ['RESEND_API_KEY'],
  turnstile: ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'],
  unsplash: ['UNSPLASH_ACCESS_KEY'],
  pexels: ['PEXELS_API_KEY'],
  canva: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
}
const ready = Object.keys(services).filter((name) => services[name].every((key) => process.env[key]))
const waiting = Object.keys(services).filter((name) => !ready.includes(name))
console.log(
  `provera env-a (${mode}): u redu; podešeno: ${ready.join(', ') || 'ništa'}; čeka: ${waiting.join(', ') || 'ništa'}`,
)
