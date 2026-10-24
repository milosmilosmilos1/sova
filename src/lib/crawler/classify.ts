import type { PageType } from './types'

/** Prepoznavanje tipa stranice po putanji, srpski i engleski nazivi (brif 5.1). */
const RULES: Array<[RegExp, PageType]> = [
  [/^\/?$/, 'home'],
  [/(^|\/)(blog|vesti|novosti|news|clanci|članci|articles|magazin|saveti|tips)(\/|$)/i, 'blog_index'],
  [/(^|\/)(usluge|usluga|servisi|services?|ponuda|sta-radimo|šta-radimo|what-we-do)(\/|$)/i, 'services'],
  [/(^|\/)(proizvodi|proizvod|products?|shop|prodavnica|katalog|catalog|asortiman)(\/|$)/i, 'products'],
  [/(^|\/)(cenovnik|cene|cena|pricing|prices?|paketi|plans?|tarife)(\/|$)/i, 'pricing'],
  [
    /(^|\/)(o-nama|o_nama|onama|about(-us)?|ko-smo-mi|nasa-prica|naša-priča|istorijat|about-me)(\/|$)/i,
    'about',
  ],
  [
    /(^|\/)(studije-slucaja|studija-slucaja|case-stud(y|ies)|uspesne-price|success-stories)(\/|$)/i,
    'case_study',
  ],
  [
    /(^|\/)(reference|referenca|portfolio|radovi|projekti|projects?|our-work|galerija|gallery|realizacije)(\/|$)/i,
    'portfolio',
  ],
  [
    /(^|\/)(recenzije|utisci|iskustva|reviews?|testimonials?|misljenja|mišljenja|klijenti-o-nama)(\/|$)/i,
    'reviews',
  ],
  [/(^|\/)(faq|cesta-pitanja|česta-pitanja|pitanja-i-odgovori|pitanja|questions)(\/|$)/i, 'faq'],
  [/(^|\/)(kontakt|contact(-us)?|kontaktirajte-nas|lokacija|gde-smo)(\/|$)/i, 'contact'],
  [/(^|\/)(tim|nas-tim|naš-tim|team|our-team|zaposleni|ljudi)(\/|$)/i, 'team'],
  [/(^|\/)(karijera|karijere|posao|zaposlenje|careers?|jobs?|oglasi-za-posao)(\/|$)/i, 'careers'],
  [
    /(^|\/)(politika-privatnosti|privatnost|privacy|uslovi|uslovi-koriscenja|terms|kolacici|cookies|impressum|impresum|pravne-informacije|legal|gdpr)(\/|$)/i,
    'legal',
  ],
]

const BLOG_POST_HINT = /(^|\/)(blog|vesti|novosti|news|clanci|članci|articles|magazin|saveti)\/[^/]+\/?$/i
const DATE_IN_PATH = /\/20\d{2}\/\d{1,2}\//

export function classifyPath(pathname: string): PageType {
  const path = decodeURIComponent(pathname || '/').replace(/\/+$/, '') || '/'
  if (path === '/') return 'home'
  if (BLOG_POST_HINT.test(path) || DATE_IN_PATH.test(path)) return 'blog_post'
  for (const [re, type] of RULES) if (re.test(path)) return type
  return 'other'
}

/** Veći broj = ranije se obrađuje (brif 5.1 redosled). */
export const PRIORITY: Record<PageType, number> = {
  home: 100,
  about: 90,
  services: 88,
  products: 86,
  pricing: 84,
  portfolio: 80,
  case_study: 78,
  blog_index: 70,
  blog_post: 60,
  reviews: 75,
  faq: 72,
  contact: 82,
  team: 50,
  careers: 20,
  legal: 10,
  other: 40,
}

const SKIP_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|gz|jpe?g|png|gif|webp|svg|ico|bmp|tiff?|mp4|mov|avi|mp3|wav|css|js|json|xml|txt|rss|atom|woff2?|ttf|eot)$/i
const SKIP_PATH =
  /(^|\/)(wp-admin|wp-login|wp-json|wp-content|wp-includes|cart|korpa|checkout|placanje|plaćanje|login|prijava|register|registracija|account|moj-nalog|my-account|admin|cdn-cgi|feed|tag|oznaka|author|autor|page\/\d+|strana\/\d+|search|pretraga|\?s=)(\/|$)/i
const SKIP_QUERY = /(^|&)(s|q|search|replytocom|add-to-cart|orderby|filter)=/i

export function shouldSkipUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
  if (SKIP_EXT.test(url.pathname)) return true
  if (SKIP_PATH.test(url.pathname)) return true
  if (url.search && SKIP_QUERY.test(url.search.slice(1))) return true
  return false
}

/** Isti sajt: isti host ili www varijanta. */
export function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return strip(a.hostname) === strip(b.hostname)
}

export function canonicalPageKey(url: URL): string {
  const u = new URL(url.toString())
  u.hash = ''
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  u.protocol = 'https:'
  let path = u.pathname.replace(/\/index\.(html?|php)$/i, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  u.pathname = path
  return u.toString()
}
