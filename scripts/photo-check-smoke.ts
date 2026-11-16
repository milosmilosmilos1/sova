/**
 * Živa proba provere fotografija (D-167) sa ključem iz .env.local: prave slike sa Unsplash-a i
 * tema objave idu kroz istu funkciju i isti rok kao u automatskom izboru, svaka slika posebno, da
 * se vidi koja prolazi. Na kraju i upit za fotografije koji model piše za stariju objavu. Ključ se
 * ne ispisuje; troši nekoliko poziva Gemini-ja.
 * Pokretanje: npx tsx --env-file=.env.local --conditions=react-server scripts/photo-check-smoke.ts
 */
import { resolvePhotoQuery } from '@/services/design/photo-query'
import { checkPhotos } from '@/services/visuals/photo-check'

const TOPIC =
  'Kviz: Koliko dobro poznaješ ishranu psa?\n\nKviz o postepenom prelasku na novu hranu. Pitanje: Koliko dana je potrebno za siguran prelazak psa na novu hranu?'
const QUERY = 'dog eating kibble'

/** Slike koje je automatski izbor ranije dobio za objave o psima (prva je mačka iz prave objave). */
const PHOTOS: Array<[string, string]> = [
  [
    'mačka koja leži na zemlji',
    'https://images.unsplash.com/photo-1668363486539-59c33be88515?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8Mnx8ZG9nJTIwZWF0aW5nfGVufDF8Mnx8fDE3OTQ4NDMyNDV8MA&ixlib=rb-4.1.0',
  ],
  [
    'crni pas sa belom ogrlicom',
    'https://images.unsplash.com/photo-1497993950456-cdb57afd1cf1?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8MXx8ZG9nJTIwbG9va2luZ3xlbnwxfDJ8fHwxNzk0ODQzNjE4fDA&ixlib=rb-4.1.0',
  ],
  [
    'korgi pored drugog psa',
    'https://images.unsplash.com/photo-1560743641-3914f2c45636?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8Mnx8ZG9nJTIwZWF0aW5nfGVufDF8MXx8fDE3OTQ4NDM1OTR8MA&ixlib=rb-4.1.0',
  ],
  [
    'pas na stenovitoj plaži',
    'https://images.unsplash.com/photo-1729297916409-17277cb10a5c?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8MXx8ZnJvemVuJTIwcmF3JTIwZG9nJTIwZm9vZCUyMGJhcmZ8ZW58MXwyfHx8MTc5NDg0MzQxM3ww&ixlib=rb-4.1.0',
  ],
  [
    'pasulj u plavoj činiji',
    'https://images.unsplash.com/photo-1497533922876-a261efd98c5a?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8MXx8ZG9nJTIwd2VpZ2h0JTIwY29udHJvbCUyMGRyeSUyMGZvb2R8ZW58MXwyfHx8MTc5NDg0MzQ4M3ww&ixlib=rb-4.1.0',
  ],
  [
    'čivava na povocu',
    'https://images.unsplash.com/photo-1745930324022-0a9b6de66ac7?ixid=M3wxMTE3MjMwfDB8MXxzZWFyY2h8MXx8Y3V0ZSUyMHNtYWxsJTIwZG9nJTIwZWF0aW5nJTIwa2liYmxlJTIwYm93bHxlbnwxfDJ8fHwxNzk0ODQzNDU2fDA&ixlib=rb-4.1.0',
  ],
]

const thumb = (raw: string) => {
  const u = new URL(raw)
  u.searchParams.set('w', '384')
  u.searchParams.set('q', '60')
  u.searchParams.set('auto', 'format')
  return u.toString()
}

async function main() {
  console.log(`tema: ${TOPIC.split('\n')[0]}\nupit: ${QUERY}\n`)
  for (const [label, raw] of PHOTOS) {
    const started = Date.now()
    // isti rok kao automatski izbor (12 s za sve provere jednog izbora)
    const taken = await checkPhotos([{ item: label, text: '', frames: [thumb(raw)] }], {
      label: 'smoke',
      until: Date.now() + 12_000,
      subject: { topic: TOPIC, query: QUERY },
    })
    const ms = Date.now() - started
    const focus = taken[0]?.focus
    console.log(
      `${taken.length ? 'UZIMA ' : 'odbija'}  ${label}${focus ? `  (predmet ${Math.round(focus.x * 100)}%, ${Math.round(focus.y * 100)}%)` : ''}  ${ms} ms`,
    )
  }
  const query = await resolvePhotoQuery({
    topic: TOPIC,
    copy: { slides: [{ kind: 'cover', title: 'Koliko poznaješ ishranu pasa?' }], photoAssetIds: [] },
  })
  console.log(`\nupit za stariju objavu: ${query}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
