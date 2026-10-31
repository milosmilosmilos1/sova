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

export function translateServerText(text: string, locale: AppLocale, depth = 0): string {
  if (locale === 'sr-Latn' || !text) return text
  const exact = DICTIONARIES[locale][text]
  if (exact) return exact
  if (depth > 2) return text
  for (const p of patterns(locale)) {
    const match = p.re.exec(text)
    if (!match) continue
    return p.out.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const i = p.slots.indexOf(name)
      return i < 0 ? whole : translateServerText(match[i + 1] ?? '', locale, depth + 1)
    })
  }
  return text
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
