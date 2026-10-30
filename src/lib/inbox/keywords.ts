/**
 * Ključne reči DM automatizacije (D-117): „CENA”, „cena?”, „Цена” i „cená” su ista reč. Tekst se
 * prevodi sa ćirilice (srpske i ukrajinske) na latinicu, skidaju se akcenti i kvačice, a reč mora
 * da stoji sama (ne „cenovnik” za „cena”). Ključna reč od više reči traži te reči jednu do druge.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  ђ: 'dj',
  е: 'e',
  є: 'e',
  ж: 'z',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'i',
  й: 'j',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ћ: 'c',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'c',
  џ: 'dz',
  ш: 's',
  щ: 'sc',
  ь: '',
  ъ: '',
  ы: 'y',
  э: 'e',
  ю: 'ju',
  я: 'ja',
}

export function normalizeText(value: string): string {
  return [...value.toLowerCase()]
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('')
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Ključna reč za čuvanje: bez razmaka na krajevima, bez # i navodnika, najviše 40 znakova. */
export function cleanKeyword(value: string): string {
  return value
    .replace(/^[\s#"'„“”«»]+|[\s"'„“”«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
}

export function matchesKeyword(text: string, keywords: readonly string[]): string | null {
  const hay = normalizeText(text)
  for (const raw of keywords) {
    const kw = normalizeText(cleanKeyword(raw))
    if (!kw) continue
    // emoji ili znak bez slova i brojeva: dovoljno je da se pojavi
    if (!/[a-z0-9]/.test(kw)) {
      if (hay.includes(kw)) return raw
      continue
    }
    const words = kw.split(' ').map(escape).join('\\s+')
    if (new RegExp(`(^|[^a-z0-9])${words}($|[^a-z0-9])`).test(hay)) return raw
  }
  return null
}
