import { createHash } from 'node:crypto'

import * as cheerio from 'cheerio'

import { classifyPath, sameSite, shouldSkipUrl } from './classify'
import type { ExtractedPage, IconLink, ImageRef, LogoCandidate } from './types'

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'template',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '.cookie',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '.breadcrumb',
  '[class*="breadcrumb"]',
  '.menu',
  '.navbar',
  '.sidebar',
  '.widget',
  '.share',
  '.social-share',
  '.comments',
  '#comments',
]

const MAIN_SELECTORS = [
  'main',
  '[role="main"]',
  'article',
  '#content',
  '#main',
  '.content',
  '.main-content',
  '.entry-content',
  '.site-content',
]

const SOCIAL_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/i, 'facebook'],
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)(twitter|x)\.com$/i, 'x'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube'],
  [/(^|\.)pinterest\.(com|rs|co\.uk|de)$/i, 'pinterest'],
  [/(^|\.)(g\.page|business\.site)$|maps\.google\.|google\.com$/i, 'google_business'],
]
const SOCIAL_SHARE = /sharer|share\?|intent\/tweet|share-offsite|pin\/create/i

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function abs(base: string, href: string | undefined): string | null {
  if (!href) return null
  const h = href.trim()
  if (!h || h.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(h)) return null
  try {
    return new URL(h, base).toString()
  } catch {
    return null
  }
}

function parseSize(sizes: string | null): number {
  if (!sizes) return 0
  const m = sizes.match(/(\d+)x(\d+)/i)
  return m ? Math.max(Number(m[1]), Number(m[2])) : sizes === 'any' ? 512 : 0
}

function jsonLdLogo(blocks: unknown[]): string | null {
  for (const block of blocks) {
    const obj = block as Record<string, unknown>
    const logo = obj.logo
    if (typeof logo === 'string') return logo
    if (logo && typeof logo === 'object' && typeof (logo as Record<string, unknown>).url === 'string') {
      return (logo as Record<string, unknown>).url as string
    }
  }
  return null
}

export function flattenJsonLd(raw: unknown): unknown[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.flatMap(flattenJsonLd)
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj['@graph'])) return [obj, ...flattenJsonLd(obj['@graph'])]
    return [obj]
  }
  return []
}

/** Izvlači sve što Brand Brain treba iz jedne HTML stranice (brif 5.1 tačka 6). */
export function extractPage(html: string, finalUrl: string, httpStatus: number): ExtractedPage {
  const $ = cheerio.load(html)
  const base = $('base[href]').attr('href')
    ? new URL($('base[href]').attr('href')!, finalUrl).toString()
    : finalUrl
  const pageUrl = new URL(finalUrl)

  const title =
    clean($('title').first().text()) || clean($('meta[property="og:title"]').attr('content') ?? '') || null
  const metaDescription = clean($('meta[name="description"]').attr('content') ?? '') || null
  const lang = ($('html').attr('lang') ?? '').trim().toLowerCase() || null
  const canonicalUrl = abs(base, $('link[rel="canonical"]').attr('href'))

  const openGraph: Record<string, string> = {}
  $('meta[property^="og:"], meta[name^="twitter:"]').each((_, el) => {
    const key = ($(el).attr('property') ?? $(el).attr('name') ?? '').trim()
    const value = clean($(el).attr('content') ?? '')
    if (key && value && !openGraph[key]) openGraph[key] = value
  })
  const themeColor = clean($('meta[name="theme-color"]').first().attr('content') ?? '') || null

  const jsonLd: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(...flattenJsonLd(JSON.parse($(el).text())))
    } catch {
      // nevalidan JSON-LD se preskače
    }
  })

  const iconLinks: IconLink[] = []
  $('link[rel]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase()
    if (!/icon/.test(rel)) return
    const href = abs(base, $(el).attr('href'))
    if (href) iconLinks.push({ href, rel, sizes: $(el).attr('sizes') ?? null })
  })

  const stylesheets: string[] = []
  $('link[rel~="stylesheet"][href]').each((_, el) => {
    const href = abs(base, $(el).attr('href'))
    if (href && stylesheets.length < 8) stylesheets.push(href)
  })
  const inlineCss = $('style')
    .map((_, el) => $(el).text())
    .get()
    .join('\n')
    .slice(0, 200_000)

  const feedLinks: string[] = []
  $('link[rel="alternate"][type]').each((_, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase()
    if (/rss|atom/.test(type)) {
      const href = abs(base, $(el).attr('href'))
      if (href) feedLinks.push(href)
    }
  })

  // Slike i kandidati za logo pre uklanjanja header/nav šuma
  const images: ImageRef[] = []
  const logoCandidates: LogoCandidate[] = []
  const seenImg = new Set<string>()
  const headerScope = $(
    'header, nav, [role="banner"], .header, #header, .navbar, .site-header, .logo, #logo, .brand, .navbar-brand',
  )
  const ldLogo = abs(base, jsonLdLogo(jsonLd) ?? undefined)
  if (ldLogo) logoCandidates.push({ src: ldLogo, alt: 'logo (JSON-LD)', score: 100, reason: 'json-ld' })

  $('img').each((_, el) => {
    const src =
      abs(base, $(el).attr('src')) ??
      abs(base, $(el).attr('data-src')) ??
      abs(base, ($(el).attr('srcset') ?? $(el).attr('data-srcset') ?? '').split(',')[0]?.trim().split(' ')[0])
    if (!src || src.startsWith('data:')) return
    const alt = clean($(el).attr('alt') ?? '')
    const width = Number($(el).attr('width')) || null
    const height = Number($(el).attr('height')) || null
    if ((width && width <= 2) || (height && height <= 2)) return
    if (!seenImg.has(src) && images.length < 60) {
      images.push({ src, alt, width, height })
      seenImg.add(src)
    }
    const hint =
      `${src} ${alt} ${$(el).attr('class') ?? ''} ${$(el).attr('id') ?? ''} ${$(el).attr('title') ?? ''}`.toLowerCase()
    const inHeader = $(el).closest(headerScope).length > 0
    const inHomeLink =
      $(el).closest('a').length > 0 &&
      /^(\/|https?:\/\/[^/]+\/?)$/.test($(el).closest('a').attr('href') ?? '')
    if (/logo/.test(hint)) logoCandidates.push({ src, alt, score: inHeader ? 95 : 85, reason: 'img:logo' })
    else if (inHeader && inHomeLink) logoCandidates.push({ src, alt, score: 80, reason: 'header-home-link' })
    else if (inHeader && logoCandidates.length < 6)
      logoCandidates.push({ src, alt, score: 50, reason: 'header-img' })
  })
  const ogImage = openGraph['og:image']
  if (ogImage && /logo/i.test(ogImage))
    logoCandidates.push({ src: ogImage, alt: 'og:image', score: 60, reason: 'og:image' })
  for (const icon of iconLinks) {
    const size = parseSize(icon.sizes)
    if (icon.rel.includes('apple-touch-icon'))
      logoCandidates.push({ src: icon.href, alt: 'apple-touch-icon', score: 40, reason: 'apple-touch-icon' })
    else if (size >= 192)
      logoCandidates.push({
        src: icon.href,
        alt: 'icon',
        score: 35 + Math.min(10, size / 100),
        reason: `icon ${size}px`,
      })
  }
  logoCandidates.sort((a, b) => b.score - a.score)

  // Linkovi (interni + društvene mreže)
  const internal = new Set<string>()
  const socialLinks: Record<string, string> = {}
  $('a[href]').each((_, el) => {
    const href = abs(base, $(el).attr('href'))
    if (!href) return
    let u: URL
    try {
      u = new URL(href)
    } catch {
      return
    }
    if (sameSite(u, pageUrl)) {
      if (!shouldSkipUrl(u) && internal.size < 500) {
        u.hash = ''
        internal.add(u.toString())
      }
      return
    }
    if (SOCIAL_SHARE.test(href)) return
    for (const [re, platform] of SOCIAL_HOSTS) {
      if (re.test(u.hostname) && !socialLinks[platform]) {
        if (platform === 'google_business' && !/maps|g\.page|business\.site/.test(href)) continue
        socialLinks[platform] = href
      }
    }
  })

  const publishedAt =
    openGraph['article:published_time'] ??
    (
      jsonLd.find((b) => typeof (b as Record<string, unknown>).datePublished === 'string') as
        Record<string, string> | undefined
    )?.datePublished ??
    $('time[datetime]').first().attr('datetime') ??
    null

  // Naslovi
  const headingList = (sel: string) =>
    [
      ...new Set(
        $(sel)
          .map((_, el) => clean($(el).text()))
          .get()
          .filter((t) => t.length > 1 && t.length <= 200),
      ),
    ].slice(0, 30)
  const headings = { h1: headingList('h1'), h2: headingList('h2'), h3: headingList('h3') }

  // Glavni tekst bez šuma
  const scriptCount = $('script').length
  $(NOISE_SELECTORS.join(',')).remove()
  let root: ReturnType<typeof $> = $('body')
  for (const sel of MAIN_SELECTORS) {
    const candidate = $(sel).first()
    if (candidate.length && clean(candidate.text()).length > 200) {
      root = candidate
      break
    }
  }
  const blocks: string[] = []
  root.find('h1,h2,h3,h4,p,li,blockquote,td,dd,dt,figcaption').each((_, el) => {
    const t = clean($(el).text())
    if (t.length >= 2) blocks.push(t)
  })
  let text = [...new Set(blocks)].join('\n\n')
  if (text.length < 200) text = clean(root.text())
  text = text.slice(0, 60_000)
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0

  const isSpaShell =
    wordCount < 40 &&
    scriptCount >= 3 &&
    ($('#root').length > 0 ||
      $('#app').length > 0 ||
      $('#__next').length > 0 ||
      $('#___gatsby').length > 0 ||
      $('[data-reactroot]').length > 0)

  const contentHash = createHash('sha256')
    .update(`${title ?? ''}\n${text}`)
    .digest('hex')

  return {
    url: finalUrl,
    canonicalUrl,
    type: classifyPath(pageUrl.pathname),
    title,
    metaDescription,
    lang,
    headings,
    text,
    wordCount,
    images,
    jsonLd,
    openGraph,
    socialLinks,
    stylesheets,
    inlineCss,
    themeColor,
    iconLinks,
    logoCandidates,
    internalLinks: [...internal],
    feedLinks,
    publishedAt,
    contentHash,
    httpStatus,
    isSpaShell,
  }
}

/** Dekodira telo odgovora po charset-u iz headera ili meta taga. */
export function decodeHtml(body: Buffer, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1]
  let charset = fromHeader?.toLowerCase() ?? ''
  if (!charset) {
    const head = body.subarray(0, 4096).toString('latin1')
    charset = (/charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8').toLowerCase()
  }
  try {
    return new TextDecoder(charset === 'utf8' ? 'utf-8' : charset, { fatal: false }).decode(body)
  } catch {
    return body.toString('utf8')
  }
}
