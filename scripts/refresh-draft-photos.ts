/**
 * Nove fotografije za nacrte koji čekaju (D-170): šalje pozadinski posao `design/drafts.photos-refresh`
 * za navedene brendove. Posao radi brend po brend, nacrt po nacrt sa pauzom (Unsplash demo prima 50
 * zahteva na sat, Pexels 200), i sam šalje sledeći brend. Nacrt koji ne dobije bar onoliko fotografija
 * koliko je imao ostaje kakav je. Bez --posalji skripta samo ispisuje šta bi poslala. Ključ događaja
 * se čita iz env fajla i ne ispisuje se; baza se ne dira odavde.
 *
 * Pokretanje:
 *   npx tsx --env-file=<env fajl sa INNGEST_EVENT_KEY> scripts/refresh-draft-photos.ts \
 *     --brend <id>[,<id>...] [--posalji]
 */
import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name)
  return i > 0 ? (process.argv[i + 1] ?? null) : null
}

async function main() {
  const brandIds = [
    ...new Set(
      (arg('--brend') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (!brandIds.length) throw new Error('Navedite brendove: --brend <id>[,<id>...]')
  const wrong = brandIds.filter((id) => !UUID.test(id))
  if (wrong.length) throw new Error(`Nije ispravan ID brenda: ${wrong.join(', ')}`)
  const event = events.designPhotosRefresh.create({ brandIds })
  console.log(`događaj: ${event.name}\nbrendovi redom: ${brandIds.join(', ')}`)
  if (!process.argv.includes('--posalji')) {
    console.log('bez --posalji ništa nije poslato')
    return
  }
  if (!process.env.INNGEST_EVENT_KEY) throw new Error('Nema INNGEST_EVENT_KEY u env fajlu.')
  const { ids } = await inngest.send(event)
  console.log(`poslato, događaj ${ids.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
