import type { ContentLocale } from '@/config/locales'
import { normalizeText } from '@/lib/inbox/keywords'

/**
 * Jedan jezik u objavi (vlasnik, 21.11.2026: „šta je na engleskom ide samo engleski, šta je srpski
 * ide samo srpski”). Prepoznaje rečenice koje su jasno na drugom jeziku od jezika objave.
 *
 * Provera je namerno oprezna, jer lažna uzbuna bi odbacila dobru objavu: rečenica je strana tek kad
 * ima bar dve reči koje postoje samo u drugom jeziku i nijednu iz jezika objave. Vlastita imena se ne
 * broje (nisu na spiskovima), a heštegovi, @nalozi, linkovi i email adrese se izbacuju pre provere.
 * Reči koje postoje u oba jezika (to, on, me, more, most, let, one, take, a, i…) nisu na spiskovima.
 */
const ENGLISH = new Set([
  'the',
  'and',
  'of',
  'for',
  'with',
  'your',
  'you',
  'our',
  'we',
  'is',
  'are',
  'in',
  'at',
  'from',
  'this',
  'that',
  'it',
  'be',
  'or',
  'by',
  'as',
  'now',
  'get',
  'will',
  'can',
  'all',
  'about',
  'here',
  'what',
  'how',
  'why',
  'when',
  'who',
  'their',
  'they',
  'us',
  'into',
  'out',
  'new',
  'best',
  'book',
  'call',
  'visit',
  'discover',
  'join',
  'enjoy',
  'today',
  'just',
  'was',
  'were',
  'has',
  'have',
  'not',
  'an',
  'if',
  'but',
  'than',
  'then',
  'there',
  'these',
  'those',
  'my',
  'its',
  'every',
  'each',
  'only',
  'also',
  'very',
  'make',
  'see',
  'find',
  'our',
  'yours',
  'would',
  'could',
  'should',
  'which',
  'while',
  'where',
  'after',
  'before',
  'over',
  'up',
  'down',
  'off',
  'tonight',
  'night',
  'free',
  "let's",
  "don't",
  "it's",
  "we're",
  "you're",
  'message',
  'contact',
  'order',
  'shop',
  'learn',
  'read',
  'ready',
  'grow',
  'help',
])

/** Srpske reči bez kvačica i u latinici (ćirilica se prevodi pre provere). */
const SERBIAN = new Set([
  'je',
  'su',
  'sam',
  'smo',
  'ste',
  'si',
  'da',
  'za',
  'sa',
  'od',
  'do',
  'kod',
  'kao',
  'sto',
  'ili',
  'ali',
  'pa',
  'vec',
  'jos',
  'samo',
  'nije',
  'nisu',
  'nema',
  'ima',
  'imamo',
  'imate',
  'biti',
  'bio',
  'bila',
  'bilo',
  'ce',
  'cu',
  'cemo',
  'cete',
  'kako',
  'gde',
  'kad',
  'kada',
  'zasto',
  'koji',
  'koja',
  'koje',
  'koju',
  'kojima',
  'ovaj',
  'ova',
  'ovo',
  'ove',
  'taj',
  'ta',
  'njih',
  'nas',
  'nam',
  'vas',
  'vam',
  'vase',
  'vasa',
  'vasi',
  'nase',
  'nasa',
  'nasi',
  'nasem',
  'vasem',
  'svoj',
  'svoje',
  'sve',
  'svi',
  'sada',
  'danas',
  'sutra',
  'ovde',
  'tamo',
  'uz',
  'bez',
  'pre',
  'posle',
  'preko',
  'izmedju',
  'oko',
  'kroz',
  'prema',
  'iz',
  'na',
  'u',
  'se',
  'li',
  'ne',
  'mi',
  'vi',
  'ti',
  'ja',
  'ona',
  'oni',
  'ono',
  'nego',
  'jer',
  'ako',
  'dok',
  'tek',
  'cak',
  'opet',
  'evo',
  'pozovite',
  'pisite',
  'javite',
  'zakazite',
  'posetite',
  'pogledajte',
  'saznajte',
  'porucite',
  'rezervisite',
  'pozovi',
  'pisi',
  'javi',
  'zakazi',
  'poseti',
  'pogledaj',
  'saznaj',
  'poruci',
  'rezervisi',
  'vise',
  'manje',
  'dana',
  'godina',
  'cena',
  'cene',
  'besplatno',
  'uvek',
  'nikad',
  'jedan',
  'jedna',
  'jedno',
  'dva',
  'tri',
])

const SERBIAN_LETTERS = /[čćžšđČĆŽŠĐђјљњћџЂЈЉЊЋЏ]/

/** Heštegovi, @nalozi, linkovi i email adrese ne govore ništa o jeziku rečenice. */
function stripNonWords(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_]+/gu, ' ')
}

/** Jezik jedne rečenice kad je jasan, inače null (kratka, mešana ili bez prepoznatih reči). */
export function sentenceLanguage(sentence: string): 'en' | 'sr' | null {
  const tokens = stripNonWords(sentence)
    .split(/[^\p{L}'’]+/u)
    .filter(Boolean)
  if (tokens.length < 3) return null
  let en = 0
  let sr = 0
  for (const token of tokens) {
    if (SERBIAN_LETTERS.test(token) || token === 'i') {
      sr++
      continue
    }
    const plain = normalizeText(token)
    if (SERBIAN.has(plain)) sr++
    else if (ENGLISH.has(token.toLowerCase())) en++
  }
  if (en >= 2 && sr === 0) return 'en'
  if (sr >= 2 && en === 0) return 'sr'
  return null
}

/** Rečenice i redovi teksta, bez praznih. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Rečenice koje su jasno na drugom jeziku od jezika objave. */
export function foreignSentences(text: string, locale: ContentLocale): string[] {
  const other = locale === 'en' ? 'sr' : 'en'
  return sentencesOf(text).filter((s) => sentenceLanguage(s) === other)
}

/** Da li je kratak tekst (poziv na akciju, citat) jasno na drugom jeziku od jezika objave. */
export function isForeign(text: string, locale: ContentLocale): boolean {
  return foreignSentences(text, locale).length > 0
}
