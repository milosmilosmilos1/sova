/**
 * Ljudi na fotografijama i snimcima (D-136): objava za tržište Srbije (i Ukrajine) prikazuje ljude
 * sa kojima se publika poistovećuje. Sova to postiže upitom: kad upit pominje ljude ili scenu sa
 * ljudima, traži evropske ljude. Izgled ljudi se ne procenjuje na slici.
 */
export type PeopleLook = 'europe' | 'any'

/** Podešavanje brenda: kao publika (podrazumevano) ili bilo ko. */
export type PeopleSetting = 'local' | 'any'

/** Reči za ljude i scene sa ljudima u upitu (engleski, kako ga piše Gemini). */
const PEOPLE =
  /\b(people|persons?|m[ae]n|wom[ae]n|girls?|boys?|guys?|lad(y|ies)|couples?|famil(y|ies)|friends?|teams?|colleagues?|co-?workers?|employees?|staff|workers?|customers?|clients?|guests?|brides?|grooms?|child(ren)?|kids?|bab(y|ies)|students?|business(man|men|woman|women)|entrepreneurs?|chefs?|waiters?|waitress(es)?|baristas?|bartenders?|crowds?|audiences?|portraits?|faces?|hands?|doctors?|dentists?|nurses?|teachers?|athletes?|dancers?|dancing|musicians?|djs?|models?|mothers?|fathers?|parents?|grand(mother|father|parents)s?|seniors?|teen(ager)?s?|youth|humans?|smiling|laughing|wedding|party|parties|celebration|birthday|meeting|conference|concert|festival|dinner|gathering|nightlife|workout|classroom)\b/i

const ALREADY = /\b(european|caucasian|white|serbian|ukrainian|balkan)\b/i

/** Upit za fotografije i snimke: „european” ispred upita koji pominje ljude, kad brend traži lokalni izgled. */
export function localPeopleQuery(query: string, look: PeopleLook): string {
  const q = query.trim()
  if (look !== 'europe' || !q || !PEOPLE.test(q) || ALREADY.test(q)) return q
  return `european ${q}`
}

/** Lokalni izgled važi za objave na srpskom i ukrajinskom; brend može da ga isključi. */
export function peopleLookFor(
  contentLocale: string | null | undefined,
  setting?: PeopleSetting | null,
): PeopleLook {
  if (setting === 'any') return 'any'
  return contentLocale && (contentLocale.startsWith('sr') || contentLocale === 'uk') ? 'europe' : 'any'
}
