/**
 * Brojanje teksta kao na X-u (docs.x.com/fundamentals/counting-characters, twitter-text v3): tekst
 * se normalizuje (NFC), svaki link vredi 23, emoji 2 (cela sekvenca), znakovi iz latinice, ćirilice i
 * osnovne interpunkcije 1, ostali (npr. CJK) 2. Ograničenje je 280. Koristi se u pregledaču i na serveru.
 */
export const X_TEXT_MAX = 280
const URL_WEIGHT = 23

// http(s) link ili domen sa TLD-om (X ga sam pretvara u link), bez emailova
const URL_RE =
  /(?<![@\w.-])(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:\/[^\s]*)?/gi

const LIGHT_RANGES: Array<[number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
]

const isLight = (cp: number) => LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b)
const EMOJI_RE = /\p{Extended_Pictographic}/u

/** Linkovi koje X prepoznaje (i domeni bez `https://`). */
export function findUrls(text: string): string[] {
  return text.normalize('NFC').match(URL_RE) ?? []
}

export function containsUrl(text: string): boolean {
  return findUrls(text).length > 0
}

export function xWeightedLength(text: string): number {
  const normalized = text.normalize('NFC')
  let length = (normalized.match(URL_RE)?.length ?? 0) * URL_WEIGHT
  const rest = normalized.replace(URL_RE, '')
  const segmenter = new Intl.Segmenter('sr', { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(rest)) {
    if (EMOJI_RE.test(segment)) {
      length += 2
      continue
    }
    for (const ch of segment) length += isLight(ch.codePointAt(0)!) ? 1 : 2
  }
  return length
}
