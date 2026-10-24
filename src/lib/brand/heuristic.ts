import type { Palette } from '@/lib/crawler/colors'
import type { FontInfo } from '@/lib/crawler/fonts'
import type { FeedItem, PageType } from '@/lib/crawler/types'

import {
  emptyProfile,
  overallConfidence,
  type BrandProfile,
  type Field,
  type PhotoStyle,
} from './profile-schema'

/**
 * Profil bez AI-ja (brif 5.3 fallback): iz naslova, meta opisa, JSON-LD, naslova sekcija,
 * kontakt podataka i linkova. Služi kao osnova koju AI dopunjuje, i kao jedini izvor
 * kad Gemini ključ nije podešen ili AI padne. Čiste funkcije, bez mreže.
 */
export interface HeuristicPage {
  url: string
  type: PageType
  title: string | null
  metaDescription: string | null
  lang: string | null
  headings: { h1: string[]; h2: string[]; h3: string[] } | null
  text: string
  jsonLd: unknown[]
  openGraph: Record<string, string>
  socialLinks: Record<string, string>
  publishedAt: string | null
}

export interface HeuristicVisual {
  logo: { assetId: string | null; sourceUrl: string | null; mimeType: string | null } | null
  palette: Palette | null
  fonts: FontInfo | null
  photoStyle: PhotoStyle | null
  photoStyleConfidence: number
}

export interface HeuristicInput {
  brandName: string
  websiteUrl: string
  contentLocale: BrandProfile['identity']['content_locale']['value']
  pages: HeuristicPage[]
  feedItems: FeedItem[]
  visual: HeuristicVisual | null
  crawlId: string | null
}

const f = <T>(value: T, confidence: number, source_urls: string[] = []): Field<T> => ({
  value,
  confidence,
  source_urls: source_urls.slice(0, 10),
})

type LdObject = Record<string, unknown>
const ORG_TYPES =
  /Organization|LocalBusiness|Store|Restaurant|Dentist|Physician|MedicalBusiness|ProfessionalService|Corporation|Hotel|Attorney|AutoRepair|BeautySalon|HomeAndConstructionBusiness|FinancialService|TravelAgency|RealEstateAgent|EducationalOrganization|SportsActivityLocation|HealthAndBeautyBusiness|FoodEstablishment|Service/i

function ldType(o: LdObject): string {
  const t = o['@type']
  return Array.isArray(t) ? t.map(String).join(' ') : typeof t === 'string' ? t : ''
}

function findOrg(pages: HeuristicPage[]): { org: LdObject; url: string } | null {
  for (const p of pages) {
    for (const block of p.jsonLd) {
      if (block && typeof block === 'object' && ORG_TYPES.test(ldType(block as LdObject))) {
        return { org: block as LdObject, url: p.url }
      }
    }
  }
  return null
}

function asText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && typeof (v as LdObject).name === 'string')
    return ((v as LdObject).name as string).trim() || null
  return null
}

function titleBrand(title: string | null): string | null {
  if (!title) return null
  const parts = title
    .split(/\s[|–—\-·:]\s/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  return parts.reduce((a, b) => (a.length <= b.length ? a : b)).slice(0, 120)
}

export function detectLocale(
  pages: HeuristicPage[],
  fallback: HeuristicInput['contentLocale'],
): { locale: HeuristicInput['contentLocale']; confidence: number } {
  const text = pages.map((p) => p.text.slice(0, 5000)).join(' ')
  if (!text.trim()) return { locale: fallback, confidence: 0.3 }
  const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length
  const lat = (text.match(/[A-Za-zČĆŽŠĐčćžšđ]/g) ?? []).length
  if (cyr > lat * 0.5 && cyr > 200) return { locale: 'sr-Cyrl', confidence: 0.9 }
  const lang = pages.find((p) => p.lang)?.lang ?? ''
  const serbianHits = (
    text.match(/\b(i|je|za|na|su|da|se|ili|smo|vam|naš|naša|naše|usluge|kontakt)\b/gi) ?? []
  ).length
  const englishHits = (text.match(/\b(the|and|for|with|our|you|services|contact|about)\b/gi) ?? []).length
  if (lang.startsWith('en') && englishHits > serbianHits) return { locale: 'en', confidence: 0.85 }
  if (englishHits > serbianHits * 2 && englishHits > 50) return { locale: 'en', confidence: 0.7 }
  return { locale: 'sr-Latn', confidence: lang.startsWith('sr') ? 0.9 : 0.6 }
}

const GENERIC_HEADING =
  /^(kontakt|contact|o nama|about|blog|usluge|services|proizvodi|products|početna|home|cenovnik|pricing|faq|galerija|gallery|tim|team|reference|portfolio|pročitaj više|read more|saznaj više|learn more|pošalji|send|prijavi se|subscribe|newsletter|najnovije|latest|povezani članci|related posts|podeli|share|komentari|comments|meni|menu)$/i

function sectionItems(
  pages: HeuristicPage[],
  type: PageType,
  max: number,
): { items: Array<{ name: string; description: null }>; urls: string[] } {
  const page = pages.find((p) => p.type === type)
  if (!page?.headings) return { items: [], urls: [] }
  const seen = new Set<string>()
  const items: Array<{ name: string; description: null }> = []
  for (const h of [...page.headings.h2, ...page.headings.h3]) {
    const name = h.replace(/\s+/g, ' ').trim()
    if (name.length < 3 || name.length > 80 || GENERIC_HEADING.test(name) || /\?$/.test(name)) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ name, description: null })
    if (items.length >= max) break
  }
  return { items, urls: [page.url] }
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 220)
}

const DIFF_RE =
  /(godin[aeu] iskustva|years of experience|garancij|warranty|besplatn|free |sertifik|certif|24\/7|non-stop|brz[aoi] |fast |licenc|nagrad|award|preko \d|više od \d|more than \d|over \d)/i
const PRICE_RE =
  /\b(od\s+)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s?(€|eur|evra|din\b|dinara|rsd|\$|usd|km\b)/i
const NUMBER_FACT_RE = /\b(\d{2,}|\d+\s?%)\b/
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const PHONE_RE = /(\+?\d{1,4}[\s/.-]?)?\(?0?\d{2,3}\)?[\s/.-]?\d{3}[\s.-]?\d{3,4}(?:[\s.-]?\d{1,3})?/

function pickContact(pages: HeuristicPage[]): {
  email: Field<string | null>
  phone: Field<string | null>
  address: Field<string | null>
  hours: Field<string | null>
} {
  const org = findOrg(pages)
  const contactPage = pages.find((p) => p.type === 'contact')
  const ordered = [contactPage, pages.find((p) => p.type === 'home'), ...pages].filter(
    Boolean,
  ) as HeuristicPage[]

  let email: Field<string | null> = f(null, 0)
  let phone: Field<string | null> = f(null, 0)
  let address: Field<string | null> = f(null, 0)
  let hours: Field<string | null> = f(null, 0)

  if (org) {
    const e = asText(org.org.email)
    if (e) email = f(e.replace(/^mailto:/i, ''), 0.9, [org.url])
    const t = asText(org.org.telephone)
    if (t) phone = f(t, 0.9, [org.url])
    const a = org.org.address
    if (a && typeof a === 'object') {
      const ad = a as LdObject
      const parts = [ad.streetAddress, ad.postalCode, ad.addressLocality, ad.addressCountry]
        .map(asText)
        .filter(Boolean)
      if (parts.length) address = f(parts.join(', ').slice(0, 300), 0.9, [org.url])
    } else if (typeof a === 'string' && a.trim()) address = f(a.trim().slice(0, 300), 0.8, [org.url])
    const oh = org.org.openingHours ?? org.org.openingHoursSpecification
    if (typeof oh === 'string') hours = f(oh.slice(0, 300), 0.8, [org.url])
    else if (Array.isArray(oh) && oh.every((x) => typeof x === 'string'))
      hours = f((oh as string[]).join('; ').slice(0, 300), 0.8, [org.url])
  }
  for (const p of ordered) {
    if (!email.value) {
      const m = EMAIL_RE.exec(p.text)
      if (m && !/example|sentry|wixpress|png|jpg/i.test(m[0])) email = f(m[0].toLowerCase(), 0.7, [p.url])
    }
    if (!phone.value) {
      const m = PHONE_RE.exec(p.text.replace(/ /g, ' '))
      if (m && m[0].replace(/\D/g, '').length >= 8 && m[0].replace(/\D/g, '').length <= 13)
        phone = f(m[0].trim(), 0.5, [p.url])
    }
    if (email.value && phone.value) break
  }
  return { email, phone, address, hours }
}

function mergeSocial(pages: HeuristicPage[]): { links: Record<string, string>; urls: string[] } {
  const links: Record<string, string> = {}
  const urls: string[] = []
  const ordered = [
    pages.find((p) => p.type === 'home'),
    pages.find((p) => p.type === 'contact'),
    ...pages,
  ].filter(Boolean) as HeuristicPage[]
  for (const p of ordered) {
    for (const [k, v] of Object.entries(p.socialLinks)) {
      if (!links[k]) {
        links[k] = v
        if (!urls.includes(p.url)) urls.push(p.url)
      }
    }
  }
  return { links, urls }
}

function addressForm(text: string): { address: 'vi' | 'ti'; confidence: number } {
  const vi = (
    text.match(
      /\b(vam|vas|vaš[aeiu]?|vašim|vaše|vašu|vama|pozovite|kontaktirajte|zakažite|javite|posetite|izaberite)\b/gi,
    ) ?? []
  ).length
  const ti = (
    text.match(
      /\b(tebi|tvoj[aeiu]?|tvoje|tvoju|pozovi|kontaktiraj|zakaži|javi se|poseti|izaberi|kreni|probaj)\b/gi,
    ) ?? []
  ).length
  if (vi + ti < 5) return { address: 'vi', confidence: 0.4 }
  return vi >= ti
    ? { address: 'vi', confidence: Math.min(0.9, 0.5 + (vi / (vi + ti)) * 0.4) }
    : { address: 'ti', confidence: Math.min(0.9, 0.5 + (ti / (vi + ti)) * 0.4) }
}

export function buildHeuristicProfile(input: HeuristicInput): BrandProfile {
  const pages = input.pages
  const home = pages.find((p) => p.type === 'home') ?? pages[0] ?? null
  const about = pages.find((p) => p.type === 'about') ?? null
  const profile = emptyProfile({
    name: input.brandName,
    contentLocale: input.contentLocale,
    websiteUrl: input.websiteUrl,
  })
  const org = findOrg(pages)

  // Identitet
  const siteName = home?.openGraph['og:site_name'] ?? null
  const orgName = org ? asText(org.org.name) : null
  if (orgName) profile.identity.name = f(orgName.slice(0, 120), 0.85, [org!.url])
  else if (siteName) profile.identity.name = f(siteName.slice(0, 120), 0.75, [home!.url])
  else if (home && titleBrand(home.title)) profile.identity.name = f(titleBrand(home.title)!, 0.5, [home.url])

  const h1 = home?.headings?.h1[0] ?? null
  if (h1 && h1.length <= 120 && h1.toLowerCase() !== profile.identity.name.value.toLowerCase())
    profile.identity.tagline = f(h1, 0.5, [home!.url])
  else if (home?.openGraph['og:title'] && home.openGraph['og:title'].length <= 120)
    profile.identity.tagline = f(home.openGraph['og:title'], 0.35, [home.url])

  const desc =
    home?.metaDescription ??
    home?.openGraph['og:description'] ??
    (org ? asText(org.org.description) : null) ??
    about?.metaDescription ??
    null
  if (desc)
    profile.identity.description = f(desc.slice(0, 1200), 0.6, [home?.url ?? about?.url ?? input.websiteUrl])
  else if (about) {
    const first = sentences(about.text).slice(0, 3).join(' ')
    if (first) profile.identity.description = f(first.slice(0, 1200), 0.4, [about.url])
  }

  if (org) {
    const t = ldType(org.org)
      .split(' ')
      .find((x) => x !== 'Organization' && x !== 'Thing')
    if (t) profile.identity.industry = f(t.replace(/([a-z])([A-Z])/g, '$1 $2'), 0.5, [org.url])
    const a = org.org.address
    if (a && typeof a === 'object') {
      const ad = a as LdObject
      profile.identity.location = f(
        { city: asText(ad.addressLocality), country: asText(ad.addressCountry) },
        0.85,
        [org.url],
      )
    }
    const founded = asText(org.org.foundingDate)
    const year = founded ? Number(founded.slice(0, 4)) : NaN
    if (year >= 1800 && year <= 2100) profile.identity.founded_year = f(year, 0.9, [org.url])
  }
  if (!profile.identity.location.value.city) {
    const corpus = `${home?.text ?? ''}\n${about?.text ?? ''}\n${pages.find((p) => p.type === 'contact')?.text ?? ''}`
    const m =
      /\b(Beograd|Belgrade|Novi Sad|Niš|Kragujevac|Subotica|Zrenjanin|Pančevo|Čačak|Kraljevo|Novi Pazar|Smederevo|Leskovac|Valjevo|Kruševac|Vranje|Šabac|Užice|Sombor|Požarevac|Pirot|Zaječar|Kikinda|Sremska Mitrovica|Jagodina|Vršac|Bor|Prokuplje|Loznica|Podgorica|Banja Luka|Sarajevo|Zagreb|Ljubljana|Skoplje)\b/i.exec(
        corpus,
      )
    if (m)
      profile.identity.location = f(
        {
          city: m[1]!,
          country: /podgorica/i.test(m[1]!)
            ? 'Crna Gora'
            : /banja luka|sarajevo/i.test(m[1]!)
              ? 'Bosna i Hercegovina'
              : /zagreb/i.test(m[1]!)
                ? 'Hrvatska'
                : /ljubljana/i.test(m[1]!)
                  ? 'Slovenija'
                  : /skoplje/i.test(m[1]!)
                    ? 'Severna Makedonija'
                    : 'Srbija',
        },
        0.45,
        [home?.url ?? input.websiteUrl],
      )
  }

  const langs = [...new Set(pages.map((p) => p.lang?.split('-')[0]).filter((x): x is string => Boolean(x)))]
  if (langs.length) profile.identity.languages = f(langs.slice(0, 6), 0.8, [home?.url ?? input.websiteUrl])
  const loc = detectLocale(pages, input.contentLocale)
  profile.identity.content_locale = f(loc.locale, loc.confidence, home ? [home.url] : [])

  // Ponuda
  const services = sectionItems(pages, 'services', 20)
  if (services.items.length) profile.offer.services = f(services.items, 0.5, services.urls)
  else if (home?.headings) {
    const fromHome = sectionItems([{ ...home, type: 'services' }], 'services', 8)
    if (fromHome.items.length >= 3) profile.offer.services = f(fromHome.items, 0.3, [home.url])
  }
  const products = sectionItems(pages, 'products', 20)
  if (products.items.length) profile.offer.products = f(products.items, 0.5, products.urls)

  const diffs: string[] = []
  const diffUrls: string[] = []
  for (const p of [home, about].filter(Boolean) as HeuristicPage[]) {
    for (const s of sentences(p.text)) {
      if (DIFF_RE.test(s) && !diffs.includes(s)) {
        diffs.push(s)
        if (!diffUrls.includes(p.url)) diffUrls.push(p.url)
      }
      if (diffs.length >= 6) break
    }
  }
  if (diffs.length) profile.offer.differentiators = f(diffs, 0.45, diffUrls)

  const prices: string[] = []
  const priceUrls: string[] = []
  for (const p of [pages.find((x) => x.type === 'pricing'), ...pages].filter(Boolean) as HeuristicPage[]) {
    for (const s of sentences(p.text)) {
      if (PRICE_RE.test(s) && !prices.includes(s)) {
        prices.push(s.slice(0, 200))
        if (!priceUrls.includes(p.url)) priceUrls.push(p.url)
      }
      if (prices.length >= 6) break
    }
    if (prices.length >= 6) break
  }
  if (prices.length) profile.offer.price_hints = f(prices, 0.5, priceUrls)

  // Publika
  const allText = pages.map((p) => p.text).join('\n')
  const b2b = (
    allText.match(
      /\b(firm[aeiu]|kompanij[aeiu]|preduzeć[aeiu]|b2b|klijent[aiu]|poslovn[aeiou]|business(es)?|compan(y|ies)|enterprise)\b/gi,
    ) ?? []
  ).length
  const b2c = (
    allText.match(
      /\b(kupc[aiu]|porodic[aeiu]|dom[aeu]?|stan[aeu]?|deca|b2c|potrošač|customers?|family|home)\b/gi,
    ) ?? []
  ).length
  if (b2b + b2c >= 10) {
    const market = b2b > b2c * 2 ? 'b2b' : b2c > b2b * 2 ? 'b2c' : 'both'
    profile.audience.market = f(market, 0.4, home ? [home.url] : [])
  }

  // Glas
  const addr = addressForm(allText.slice(0, 200_000))
  profile.voice.address = f(addr.address, addr.confidence, home ? [home.url] : [])
  const emojiCount = (allText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length
  profile.voice.emoji = f(emojiCount >= 5, 0.5, home ? [home.url] : [])
  profile.voice.formality = f(addr.address === 'ti' ? 'casual' : 'neutral', 0.35, home ? [home.url] : [])

  // Činjenice sa brojkama
  const facts: Array<{ claim: string; source_url: string | null }> = []
  for (const p of [home, about].filter(Boolean) as HeuristicPage[]) {
    for (const s of sentences(p.text)) {
      if (
        NUMBER_FACT_RE.test(s) &&
        !PRICE_RE.test(s) &&
        !/cookie|kolači|©|copyright|\d{4}\s*[-–]\s*\d{4}/i.test(s) &&
        !facts.some((x) => x.claim === s)
      ) {
        facts.push({ claim: s.slice(0, 300), source_url: p.url })
      }
      if (facts.length >= 10) break
    }
  }
  if (facts.length) profile.facts = f(facts, 0.45, [...new Set(facts.map((x) => x.source_url!))])

  // Kontakt i mreže
  const contact = pickContact(pages)
  profile.contact = {
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    working_hours: contact.hours,
  }
  const social = mergeSocial(pages)
  if (Object.keys(social.links).length) profile.social = f(social.links, 0.9, social.urls)

  // Sadržaj
  const posts = pages
    .filter((p) => p.type === 'blog_post' && p.title)
    .map((p) => ({ title: p.title!.slice(0, 200), url: p.url, published_at: p.publishedAt }))
  for (const it of input.feedItems) {
    if (posts.length >= 20) break
    if (it.title && !posts.some((p) => p.url === it.url))
      posts.push({ title: it.title.slice(0, 200), url: it.url, published_at: it.publishedAt })
  }
  posts.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
  const hasBlog = posts.length > 0 || pages.some((p) => p.type === 'blog_index')
  profile.content.has_blog = f(hasBlog, 0.9, posts[0] ? [posts[0].url] : [])
  profile.content.recent_posts = f(
    posts.slice(0, 20),
    0.9,
    posts.slice(0, 5).map((p) => p.url),
  )
  if (posts.length)
    profile.content.blog_topics = f(
      posts.slice(0, 20).map((p) => p.title.replace(/\s[|–—-]\s.*$/, '').slice(0, 120)),
      0.6,
      posts.slice(0, 5).map((p) => p.url),
    )

  // Vizuali
  if (input.visual) {
    const v = input.visual
    if (v.logo)
      profile.visual.logo = f(
        { asset_id: v.logo.assetId, source_url: v.logo.sourceUrl, mime_type: v.logo.mimeType },
        0.8,
        v.logo.sourceUrl ? [v.logo.sourceUrl] : [],
      )
    if (v.palette) {
      profile.visual.colors = f(
        {
          primary: v.palette.primary,
          secondary: v.palette.secondary,
          accent: v.palette.accent,
          neutral_light: v.palette.neutralLight,
          neutral_dark: v.palette.neutralDark,
          text_on_primary: v.palette.contrast.textOnPrimary,
          is_monochrome: v.palette.isMonochrome,
          candidates: v.palette.candidates.map((c) => c.hex).slice(0, 8),
        },
        v.palette.isMonochrome ? 0.4 : 0.7,
        home ? [home.url] : [],
      )
    }
    if (v.fonts) {
      profile.visual.fonts = f(
        {
          headings: v.fonts.headings,
          body: v.fonts.body,
          mapped_headings: v.fonts.mappedHeadings,
          mapped_body: v.fonts.mappedBody,
          detected: v.fonts.detected,
        },
        v.fonts.body || v.fonts.headings ? 0.7 : 0.2,
        home ? [home.url] : [],
      )
    }
    if (v.photoStyle)
      profile.visual.photo_style = f(v.photoStyle, v.photoStyleConfidence, home ? [home.url] : [])
  }

  profile.meta = {
    generated_by: 'heuristic',
    model: null,
    crawl_id: input.crawlId,
    pages_used: pages.length,
    source_url: input.websiteUrl,
    generated_at: new Date().toISOString(),
    overall_confidence: 0,
  }
  profile.meta.overall_confidence = overallConfidence(profile)
  return profile
}
