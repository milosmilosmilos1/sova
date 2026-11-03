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

/** Tekst objave na X-u: link ide na kraj teksta ako ga tekst već nema (X nema posebno polje za link). */
export function composeXText(input: { text: string; link: string | null }): string {
  const text = input.text.trim()
  if (!input.link || text.includes(input.link)) return text
  return text ? `${text}\n\n${input.link}` : input.link
}

/** Najviše objava u jednoj niti; duži tekst treba skratiti. */
export const X_THREAD_MAX_PARTS = 25

interface Piece {
  text: string
  /** kako se spaja sa prethodnim delom: novi pasus ili isti pasus */
  join: '\n\n' | ' '
}

/** Reč duža od dozvoljenog (dugačak niz bez razmaka) seče se po znakovima. */
function hardSplit(word: string, fits: (s: string) => boolean): string[] {
  const out: string[] = []
  let cur = ''
  for (const { segment } of new Intl.Segmenter('sr', { granularity: 'grapheme' }).segment(word)) {
    if (fits(cur + segment)) cur += segment
    else {
      if (cur) out.push(cur)
      cur = segment
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Nit na X-u (D-150): tekst duži od 280 deli se na objave po pasusima, pa po rečenicama, pa po
 * rečima, i susedni delovi se spajaju dok staju. Kad je `numbered`, delovi dobijaju „1/5” na kraju.
 * Link se ne seče (X ga broji kao 23 znaka).
 */
export function splitXThread(text: string, opts: { numbered?: boolean } = {}): string[] {
  const clean = text.normalize('NFC').trim()
  if (!clean) return []
  if (xWeightedLength(clean) <= X_TEXT_MAX) return [clean]
  const numbered = opts.numbered ?? true
  // mesto za „ 25/25”
  const budget = X_TEXT_MAX - (numbered ? 6 : 0)
  const fits = (s: string) => xWeightedLength(s) <= budget

  const pieces: Piece[] = []
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    let join: Piece['join'] = '\n\n'
    const add = (t: string) => {
      pieces.push({ text: t, join })
      join = ' '
    }
    if (fits(p)) {
      add(p)
      continue
    }
    for (const sentence of p.split(/(?<=[.!?…])\s+/)) {
      if (fits(sentence)) {
        add(sentence)
        continue
      }
      let cur = ''
      for (const word of sentence.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word
        if (fits(next)) cur = next
        else {
          if (cur) add(cur)
          if (fits(word)) cur = word
          else {
            const chunks = hardSplit(word, fits)
            chunks.slice(0, -1).forEach(add)
            cur = chunks.at(-1) ?? ''
          }
        }
      }
      if (cur) add(cur)
    }
  }

  const parts: string[] = []
  let cur = ''
  for (const piece of pieces) {
    const next = cur ? `${cur}${piece.join}${piece.text}` : piece.text
    if (cur && !fits(next)) {
      parts.push(cur)
      cur = piece.text
    } else cur = next
  }
  if (cur) parts.push(cur)
  return numbered ? parts.map((p, i) => `${p} ${i + 1}/${parts.length}`) : parts
}
