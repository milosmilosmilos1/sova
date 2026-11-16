/**
 * Rezerva provere fotografija (D-167): kad Gemini ne može da pogleda slike (bez ključa, greška modela,
 * isteklo vreme), fotografija ili snimak sa Unsplash-a i Pexels-a prolazi samo ako opis (alt, ime iz
 * adrese) deli bar jednu značajnu reč sa upitom. Opis „a cat lying on the ground” ne prolazi za upit
 * „dog food bowl”. Boje i opšte reči („close up”, „photo”) ne računaju se kao poklapanje.
 */
const STOP = new Set(
  (
    'a an the and or of in on at to for with by from into onto over under near up down out off its his her ' +
    'their our your my is are was were be being been some any two three one this that these those very ' +
    'close closeup view photo photos photography image images picture stock background top side front ' +
    'shot shots detail details beautiful nice good great best new old small big large little modern ' +
    'white black gray grey red blue green yellow orange pink purple brown beige dark light bright colorful ' +
    'day night person people man woman men women someone something'
  ).split(' '),
)

/** Značajne reči teksta: mala slova, bez brojeva, kratkih reči i reči iz `STOP`. */
export function contentWords(text: string | null | undefined): string[] {
  const out = new Set<string>()
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue
    out.add(raw)
  }
  return [...out]
}

/** „dog” i „dogs”, „puppy” i „puppies” su ista reč; „cat” i „category” nisu. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length - short.length > 3) return false
  if (long.startsWith(short)) return true
  // puppy / puppies, berry / berries
  return short.endsWith('y') && long.startsWith(short.slice(0, -1)) && long.endsWith('ies')
}

/** Opis kandidata deli bar jednu značajnu reč sa upitom. */
export function textMatchesQuery(text: string | null | undefined, query: string): boolean {
  const want = contentWords(query)
  if (!want.length) return false
  const have = contentWords(text)
  return want.some((w) => have.some((h) => sameWord(w, h)))
}
