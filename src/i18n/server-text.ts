import type { AppLocale } from './config'
import en from './server/en.json'
import uk from './server/uk.json'

/**
 * Poruke servera na jeziku korisnika (D-130). Server i dalje piše poruke na srpskom (greške API-ja,
 * provere formi), a na izlazu (odgovor API-ja, rezultat serverske akcije) se prevode iz rečnika:
 * ključ je srpska poruka, a poruka sa promenljivim delom je šablon sa {0}, {1}… Promenljivi deo se i
 * sam prevodi kad je poznata poruka (npr. „Objava nije spremna za zakazivanje. {0}: {1}”). Poruka koje
 * nema u rečniku ostaje na srpskom; test proverava da svaka poruka iz koda ima prevod.
 */
type Translated = Exclude<AppLocale, 'sr-Latn'>
type Dictionary = Record<string, string>

const DICTIONARIES: Record<Translated, Dictionary> = { en, uk }

interface Pattern {
  re: RegExp
  slots: string[]
  out: string
}

const compiled = new Map<Translated, Pattern[]>()

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function patterns(locale: Translated): Pattern[] {
  const hit = compiled.get(locale)
  if (hit) return hit
  const list = Object.entries(DICTIONARIES[locale])
    .filter(([key]) => /\{\w+\}/.test(key))
    // duži stalni deo prvi: tačniji šablon pobeđuje opštiji
    .sort(([a], [b]) => b.replace(/\{\w+\}/g, '').length - a.replace(/\{\w+\}/g, '').length)
    .map(([key, out]) => {
      const slots: string[] = []
      const source = key
        .split(/(\{\w+\})/)
        .map((part) => {
          const slot = /^\{(\w+)\}$/.exec(part)
          if (!slot) return escape(part)
          slots.push(slot[1]!)
          return '([\\s\\S]+?)'
        })
        .join('')
      return { re: new RegExp(`^${source}$`), slots, out }
    })
  compiled.set(locale, list)
  return list
}

/** Granica rečenice: tačka, upitnik ili uzvičnik, razmak i veliko slovo ili navodnik. */
const SENTENCE_END = /(?<=[.!?])\s+(?=[\p{Lu}„"])/u
const CROSSES_SENTENCE = /[.!?]\s+[\p{Lu}„"]/u

/** Prevod po šablonu; promenljivi deo ne prelazi granicu rečenice (dužu poruku deli pozivalac). */
function byPattern(text: string, locale: Translated, depth: number): string | null {
  for (const p of patterns(locale)) {
    const match = p.re.exec(text)
    if (!match || match.slice(1).some((v) => CROSSES_SENTENCE.test(v))) continue
    const value = (name: string) => match[p.slots.indexOf(name) + 1]
    return p.out.replace(/\{(\w+)((?:\|[^|{}]*)+)?\}/g, (whole, name: string, forms?: string) => {
      if (!p.slots.includes(name)) return whole
      // {0|dan|dana}: oblik reči uz broj iz promenljive (srpski oblik iz izvora se tada izostavlja)
      if (forms) return pluralForm(locale, value(name) ?? '', forms.slice(1).split('|'))
      return translateServerText(value(name) ?? '', locale, depth + 1)
    })
  }
  return null
}

export function translateServerText(text: string, locale: AppLocale, depth = 0): string {
  if (locale === 'sr-Latn' || !text) return text
  const exact = DICTIONARIES[locale][text]
  if (exact) return exact
  if (depth > 2) return text
  const whole = byPattern(text, locale, depth)
  if (whole !== null) return whole
  // više rečenica (nedeljni izveštaj, provere kvaliteta): najduži početak koji je poznata poruka,
  // pa ostatak na isti način
  const sentences = text.split(SENTENCE_END)
  if (sentences.length < 2) return text
  const out: string[] = []
  for (let i = 0; i < sentences.length;) {
    let j = sentences.length
    let piece: string | null = null
    while (j > i + 1) {
      const chunk = sentences.slice(i, j).join(' ')
      piece = DICTIONARIES[locale][chunk] ?? byPattern(chunk, locale, depth)
      if (piece !== null) break
      j--
    }
    out.push(piece ?? translateServerText(sentences[i]!, locale, depth + 1))
    i = j
  }
  return out.join(' ')
}

/** Oblik reči uz broj: engleski jedan i ostalo, ukrajinski jedan, nekoliko (2–4) i mnogo. */
function pluralForm(locale: Translated, raw: string, forms: string[]): string {
  const n = Number(raw.replace(/[^\d]/g, '') || '0')
  if (locale === 'en') return (n === 1 ? forms[0] : forms[1]) ?? forms[0] ?? ''
  const mod10 = n % 10
  const mod100 = n % 100
  const i =
    mod10 === 1 && mod100 !== 11 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 1 : 2
  return forms[i] ?? forms[forms.length - 1] ?? ''
}

/** Poruke polja (Zod) na jeziku korisnika. */
export function translateFields(
  fields: Record<string, string[]> | undefined,
  locale: AppLocale,
): Record<string, string[]> | undefined {
  if (!fields || locale === 'sr-Latn') return fields
  return Object.fromEntries(
    Object.entries(fields).map(([k, list]) => [k, list.map((m) => translateServerText(m, locale))]),
  )
}
