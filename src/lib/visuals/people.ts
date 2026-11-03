/**
 * Ljudi na fotografijama i snimcima (D-136, D-154): tržište je Balkan, pa automatski izbor
 * fotografija i snimaka za svaki brend prikazuje samo ljude evropskog izgleda. Upit koji pominje
 * ljude traži evropske ljude, opis koji pominje drugi izgled odbija kandidata, a sličice i kadrovi
 * se pre preuzimanja proveravaju na slici (`services/visuals/people-check.ts`).
 */

/** Reči za ljude i scene sa ljudima u upitu (engleski, kako ga piše Gemini). */
const PEOPLE =
  /\b(people|persons?|m[ae]n|wom[ae]n|girls?|boys?|guys?|lad(y|ies)|couples?|famil(y|ies)|friends?|teams?|colleagues?|co-?workers?|employees?|staff|workers?|customers?|clients?|guests?|brides?|grooms?|child(ren)?|kids?|bab(y|ies)|students?|business(man|men|woman|women)|entrepreneurs?|chefs?|waiters?|waitress(es)?|baristas?|bartenders?|crowds?|audiences?|portraits?|faces?|hands?|doctors?|dentists?|nurses?|patients?|teachers?|athletes?|trainers?|coach(es)?|dancers?|dancing|musicians?|djs?|models?|mothers?|fathers?|parents?|grand(mother|father|parent)s?|seniors?|teen(ager)?s?|youth|humans?|tourists?|travell?ers?|shoppers?|hairdressers?|barbers?|stylists?|technicians?|mechanics?|plumbers?|electricians?|builders?|installers?|craftsm[ae]n|cleaners?|selfies?|smiling|laughing|weddings?|part(y|ies)|celebrations?|birthdays?|meetings?|conferences?|events?|networking|concerts?|festivals?|dinners?|gatherings?|picnics?|graduation|nightlife|clubbing|workouts?|classrooms?)\b/i

/** Upit koji već određuje izgled. „white” nije tu: u upitu je to skoro uvek boja (bela haljina, beli cvetovi). */
const ALREADY = /\b(european|caucasian|serbian|ukrainian|balkan)\b/i

/** Imenice za osobu, uz koje poreklo u opisu znači izgled ljudi („asian woman”), a ne jelo ili stvar. */
const PERSON =
  '(?:people|persons?|m[ae]n|wom[ae]n|girls?|boys?|guys?|lad(?:y|ies)|couples?|famil(?:y|ies)|friends?|teams?|colleagues?|co-?workers?|employees?|staff|workers?|customers?|clients?|guests?|brides?|grooms?|child(?:ren)?|kids?|toddlers?|bab(?:y|ies)|students?|business(?:m[ae]n|wom[ae]n|people|persons?)|models?|mothers?|fathers?|parents?|daughters?|sons?|athletes?|doctors?|nurses?|chefs?|barbers?|cleaners?|technicians?|dancers?|musicians?|teen(?:ager)?s?|seniors?|adults?|females?|males?|individuals?|hands?|faces?|skin|portraits?)'

/** Poreklo ili izgled koji opis vezuje za osobu. */
const ORIGIN =
  '(?:african|afro|asian|chinese|japanese|korean|vietnamese|thai|filipin[ao]|indonesian|malaysian|indian|pakistani|bangladeshi|arab|arabian|middle[- ]eastern|hispanic|latin[ao]|latinx|latin[- ]american|mexican|brazilian|nigerian|kenyan|ethiopian|somali|jamaican|native[- ]american|indigenous|ethnic|diverse|multicultural)'

/** Izgled koji opis kaže sam po sebi. */
const ALWAYS =
  '(?:african[- ]american|afro[- ]american|afro[- ]hair(?:ed|style)?|multi-?ethnic|multi-?racial|inter-?racial|bi-?racial|mixed[- ]race|dark[- ]skinned|darker[- ]skinned|dark[- ]skin|brown[- ]skinned|(?:people|persons?|wom[ae]n|m[ae]n) of colou?r|melanin)'

/** „black” je izgled samo uz osobu („black woman”), a ne uz odeću, kosu ili dan („black haired woman”, „black friday shoppers”). */
const BLACK = `black\\s+(?:(?!(?:haired|hair|dressed|clad|and|white|leather|shirt|t-shirt|jacket|suit|tie|hat|cap|top|dress|coat|hoodie|sweater|uniform|apron|gloves?|friday|background|backdrop)\\b)[a-z-]+\\s+)?${PERSON}`

const FOREIGN = new RegExp(
  `\\b(?:${ALWAYS}|${BLACK}|${ORIGIN}\\s+(?:[a-z-]+\\s+){0,2}?${PERSON}|${PERSON}\\s+of\\s+${ORIGIN})\\b`,
  'i',
)

/** Upit za fotografije i snimke: „european” ispred upita koji pominje ljude. */
export function localPeopleQuery(query: string): string {
  const q = query.trim()
  if (!q || !PEOPLE.test(q) || ALREADY.test(q)) return q
  return `european ${q}`
}

/** Opis (alt fotografije, ime snimka iz adrese) pominje ljude ili scenu sa ljudima. */
export function mentionsPeople(text: string | null | undefined): boolean {
  return Boolean(text && PEOPLE.test(text))
}

/** Opis pominje ljude koji nisu evropskog izgleda; takav kandidat se ne uzima ni ne gleda. */
export function foreignPeopleText(text: string | null | undefined): boolean {
  return Boolean(text && FOREIGN.test(text))
}

/** Opis iz adrese stranice: „/video/a-woman-vacuuming-the-floor-9462892/” daje „a woman vacuuming the floor”. */
export function slugText(url: string | null | undefined): string {
  if (!url) return ''
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    // ne adresa: koristi se kakva jeste
  }
  const last = path.split('/').filter(Boolean).at(-1) ?? ''
  return last
    .split(/[-_]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .join(' ')
}
