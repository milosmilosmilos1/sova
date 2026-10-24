import * as cheerio from 'cheerio'

import { canonicalPageKey, classifyPath, PRIORITY, sameSite, shouldSkipUrl } from './classify'
import type { CrawlDeps, DiscoveredUrl, ExtractedPage, FeedItem } from './types'

export interface DiscoverResult {
  urls: DiscoveredUrl[]
  feedItems: FeedItem[]
  sitemapUrls: string[]
  feedUrls: string[]
  /** hash liste URL-ova iz sitemapa i feeda (nedeljna provera, brif 5.6) */
  sitemapHash: string | null
  feedHash: string | null
  totalFound: number
}

const COMMON_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml']
const COMMON_FEEDS = ['/feed/', '/feed', '/rss.xml', '/atom.xml', '/rss', '/blog/feed/', '/feed.xml']

async function fetchText(deps: CrawlDeps, url: string, maxBytes: number): Promise<string | null> {
  try {
    const res = await deps.fetch(url, { timeoutMs: 8_000, maxBytes })
    if (!res.ok || res.contentType.includes('text/html')) return null
    return res.body.toString('utf8')
  } catch {
    return null
  }
}

export async function readSitemap(
  deps: CrawlDeps,
  url: string,
  depth = 0,
  seen = new Set<string>(),
): Promise<Array<{ loc: string; lastmod: string | null }>> {
  if (depth > 2 || seen.has(url) || seen.size > 12) return []
  seen.add(url)
  const xml = await fetchText(deps, url, 2 * 1024 * 1024)
  if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) return []
  const $ = cheerio.load(xml, { xml: true })
  const out: Array<{ loc: string; lastmod: string | null }> = []
  const children = $('sitemapindex > sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get()
  for (const child of children.slice(0, 10)) out.push(...(await readSitemap(deps, child, depth + 1, seen)))
  $('urlset > url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim()
    if (loc && out.length < 3000)
      out.push({ loc, lastmod: $(el).find('lastmod').first().text().trim() || null })
  })
  return out
}

export function parseFeed(xml: string): FeedItem[] {
  if (!/<(rss|feed|rdf:RDF)/i.test(xml)) return []
  const $ = cheerio.load(xml, { xml: true })
  const items: FeedItem[] = []
  $('item, entry').each((_, el) => {
    const node = $(el)
    const link = node.find('link').first()
    const url = (link.attr('href') ?? link.text()).trim()
    if (!url) return
    items.push({
      url,
      title: node.find('title').first().text().trim() || null,
      publishedAt: (node.find('pubDate, published, updated, dc\\:date').first().text() || '').trim() || null,
      summary:
        (node.find('description, summary, content\\:encoded').first().text() || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500) || null,
    })
  })
  return items.slice(0, 200)
}

export function hashList(list: string[]): string | null {
  if (!list.length) return null
  // deterministički hash bez node:crypto da ostane čist (koristi se i u testovima)
  let h = 2166136261
  for (const s of [...list].sort()) for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16)
}

/**
 * Pronalazi stranice sajta: sitemap (i index), RSS/Atom, linkovi sa početne; klasifikuje,
 * dedupe-uje i rangira po prioritetu, pa seče na limit plana (brif 5.1 tačke 2–4).
 */
export async function discoverUrls(
  home: Pick<ExtractedPage, 'url' | 'feedLinks' | 'internalLinks'>,
  robotsSitemaps: string[],
  limit: number,
  deps: CrawlDeps,
): Promise<DiscoverResult> {
  const origin = new URL(home.url)
  const byKey = new Map<string, DiscoveredUrl>()
  const add = (raw: string, source: DiscoveredUrl['source'], lastmod: string | null = null) => {
    let u: URL
    try {
      u = new URL(raw, origin)
    } catch {
      return
    }
    if (!sameSite(u, origin) || shouldSkipUrl(u)) return
    const key = canonicalPageKey(u)
    const type = classifyPath(u.pathname)
    const existing = byKey.get(key)
    if (existing) {
      if (lastmod && !existing.lastmod) existing.lastmod = lastmod
      return
    }
    byKey.set(key, { url: u.toString(), type, source, priority: PRIORITY[type], lastmod })
  }

  add(home.url, 'seed')

  // Sitemap
  const sitemapCandidates = [
    ...new Set([...robotsSitemaps, ...COMMON_SITEMAPS.map((p) => new URL(p, origin).toString())]),
  ]
  const sitemapUrls: string[] = []
  const sitemapLocs: string[] = []
  for (const sm of sitemapCandidates) {
    const entries = await readSitemap(deps, sm)
    if (entries.length) {
      sitemapUrls.push(sm)
      for (const e of entries) {
        sitemapLocs.push(e.loc)
        add(e.loc, 'sitemap', e.lastmod)
      }
      if (sitemapLocs.length > 300) break
    }
  }

  // Feed
  const feedCandidates = [
    ...new Set([...home.feedLinks, ...COMMON_FEEDS.map((p) => new URL(p, origin).toString())]),
  ]
  const feedUrls: string[] = []
  const feedItems: FeedItem[] = []
  for (const f of feedCandidates) {
    if (feedUrls.length) break
    const xml = await fetchText(deps, f, 2 * 1024 * 1024)
    if (!xml) continue
    const items = parseFeed(xml)
    if (items.length) {
      feedUrls.push(f)
      feedItems.push(...items)
      for (const it of items) add(it.url, 'feed', it.publishedAt)
    }
  }

  // Linkovi sa početne
  for (const link of home.internalLinks) add(link, 'link')

  const all = [...byKey.values()]
  const blogPosts = all
    .filter((u) => u.type === 'blog_post')
    .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
  const rest = all.filter((u) => u.type !== 'blog_post').sort((a, b) => b.priority - a.priority)
  // blog: najviše trećina limita, ostalo po prioritetu
  const blogQuota = Math.max(5, Math.floor(limit / 3))
  const restChosen = rest.slice(0, limit - Math.min(blogQuota, blogPosts.length))
  const chosen = [...restChosen, ...blogPosts.slice(0, limit - restChosen.length)].slice(0, limit)
  // početna uvek prva
  chosen.sort((a, b) => (a.source === 'seed' ? -1 : b.source === 'seed' ? 1 : b.priority - a.priority))

  return {
    urls: chosen,
    feedItems,
    sitemapUrls,
    feedUrls,
    sitemapHash: hashList(sitemapLocs),
    feedHash: hashList(feedItems.map((i) => i.url)),
    totalFound: all.length,
  }
}
