import 'server-only'

import { classifyPath, sameSite, shouldSkipUrl } from '@/lib/crawler/classify'
import { getCrawlDeps } from '@/lib/crawler/deps'
import { hashList, parseFeed, readSitemap } from '@/lib/crawler/discover'
import { loadRobots } from '@/lib/crawler/robots'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/**
 * Nedeljna provera sajta (brif 5.6): sitemap i RSS se uporede sa hashovima iz poslednje analize;
 * nove blog objave postaju predlozi za objave, nove ili izmenjene stranice predlog da se profil osveži.
 * Ne troši tokene i ne poziva AI.
 */
const COMMON_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml']
const COMMON_FEEDS = ['/feed/', '/feed', '/rss.xml', '/atom.xml', '/feed.xml']

export interface SiteCheckResult {
  brandId: string
  checked: boolean
  reason?: string
  newUrls: number
  newPosts: number
  profileUpdateSuggested: boolean
}

export async function listBrandsDueForSiteCheck(maxAgeDays = 6): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('brands')
    .select('id, last_site_check_at, brand_profiles!inner(id)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('website_url', 'is', null)
    .eq('brand_profiles.is_current', true)
    .or(`last_site_check_at.is.null,last_site_check_at.lt.${cutoff}`)
    .limit(500)
  if (error) throw error
  return (data ?? []).map((b) => b.id)
}

export async function runSiteCheck(brandId: string): Promise<SiteCheckResult> {
  const admin = createSupabaseAdminClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, website_url, sitemap_hash, feed_hash, status, deleted_at')
    .eq('id', brandId)
    .maybeSingle()
  const base: SiteCheckResult = {
    brandId,
    checked: false,
    newUrls: 0,
    newPosts: 0,
    profileUpdateSuggested: false,
  }
  if (!brand || brand.deleted_at || brand.status !== 'active' || !brand.website_url)
    return { ...base, reason: 'Brend nije aktivan ili nema sajt.' }

  const deps = getCrawlDeps()
  let origin: URL
  try {
    origin = new URL(brand.website_url)
  } catch {
    return { ...base, reason: 'Neispravan URL sajta.' }
  }

  let robotsSitemaps: string[] = []
  let isAllowed: (url: string) => boolean = () => true
  try {
    const robots = await loadRobots(origin.origin, deps)
    if (robots.blocksEverything) return { ...base, reason: 'robots.txt zabranjuje čitanje.' }
    robotsSitemaps = robots.sitemaps
    isAllowed = robots.isAllowed
  } catch (error) {
    return { ...base, reason: error instanceof Error ? error.message : 'Sajt nije dostupan.' }
  }

  const sitemapLocs: Array<{ loc: string; lastmod: string | null }> = []
  for (const sm of [
    ...new Set([...robotsSitemaps, ...COMMON_SITEMAPS.map((p) => new URL(p, origin).toString())]),
  ]) {
    const entries = await readSitemap(deps, sm)
    if (entries.length) {
      sitemapLocs.push(...entries)
      break
    }
  }
  let feedItems: ReturnType<typeof parseFeed> = []
  for (const f of COMMON_FEEDS.map((p) => new URL(p, origin).toString())) {
    try {
      const res = await deps.fetch(f, { timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024 })
      if (!res.ok || res.contentType.includes('text/html')) continue
      feedItems = parseFeed(res.body.toString('utf8'))
      if (feedItems.length) break
    } catch {
      continue
    }
  }
  if (!sitemapLocs.length && !feedItems.length) {
    await admin.from('brands').update({ last_site_check_at: new Date().toISOString() }).eq('id', brandId)
    return {
      ...base,
      checked: true,
      reason: 'Sajt nema sitemap ni RSS; promene se ne mogu pratiti automatski.',
    }
  }

  const sitemapHash = hashList(sitemapLocs.map((e) => e.loc))
  const feedHash = hashList(feedItems.map((i) => i.url))
  const sitemapChanged = sitemapHash !== brand.sitemap_hash
  const feedChanged = feedHash !== brand.feed_hash

  const { data: known } = await admin.from('website_pages').select('url').eq('brand_id', brandId)
  const knownUrls = new Set((known ?? []).map((k) => k.url.replace(/\/+$/, '')))
  // URL-ovi već prijavljeni u ranijim proverama se ne broje ponovo kao novi
  const { data: previousChecks } = await admin
    .from('brand_site_checks')
    .select('new_urls')
    .eq('brand_id', brandId)
    .order('checked_at', { ascending: false })
    .limit(5)
  for (const c of previousChecks ?? []) for (const u of c.new_urls) knownUrls.add(u.replace(/\/+$/, ''))
  const candidates = new Map<
    string,
    { url: string; title: string | null; publishedAt: string | null; type: ReturnType<typeof classifyPath> }
  >()
  const consider = (raw: string, title: string | null, publishedAt: string | null) => {
    let u: URL
    try {
      u = new URL(raw, origin)
    } catch {
      return
    }
    if (!sameSite(u, origin) || shouldSkipUrl(u) || !isAllowed(u.toString())) return
    const key = u.toString().replace(/\/+$/, '')
    if (knownUrls.has(key) || candidates.has(key)) return
    candidates.set(key, { url: u.toString(), title, publishedAt, type: classifyPath(u.pathname) })
  }
  for (const e of sitemapLocs) consider(e.loc, null, e.lastmod)
  for (const it of feedItems) consider(it.url, it.title, it.publishedAt)

  const newEntries = [...candidates.values()]
  const newPosts = newEntries.filter((e) => e.type === 'blog_post')
  const newOther = newEntries.filter(
    (e) => e.type !== 'blog_post' && e.type !== 'legal' && e.type !== 'careers' && e.type !== 'other',
  )
  const profileUpdateSuggested = newOther.length > 0

  const { data: existingSugg } = await admin
    .from('suggestions')
    .select('payload, kind')
    .eq('brand_id', brandId)
    .in('status', ['new'])
    .in('kind', ['new_blog_post', 'profile_update'])
  const existingPostUrls = new Set(
    (existingSugg ?? [])
      .filter((s) => s.kind === 'new_blog_post')
      .map((s) => ((s.payload as { url?: string } | null)?.url ?? '').replace(/\/+$/, '')),
  )
  const hasProfileSuggestion = (existingSugg ?? []).some((s) => s.kind === 'profile_update')

  const expires = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const rows: Array<Record<string, Json>> = []
  for (const p of newPosts.slice(0, 10)) {
    if (existingPostUrls.has(p.url.replace(/\/+$/, ''))) continue
    rows.push({
      brand_id: brandId,
      source: 'blog',
      kind: 'new_blog_post',
      title: p.title ? `Nov tekst na blogu: ${p.title}`.slice(0, 200) : 'Nov tekst na blogu',
      body: 'Napravite objavu za mreže iz novog teksta sa sajta.',
      payload: { url: p.url, title: p.title, published_at: p.publishedAt },
      evidence: { source: feedItems.length ? 'rss' : 'sitemap' },
      score: 70,
      expires_at: expires,
    })
  }
  if (profileUpdateSuggested && !hasProfileSuggestion) {
    rows.push({
      brand_id: brandId,
      source: 'site_change',
      kind: 'profile_update',
      title: 'Sajt ima nove stranice: osvežite profil brenda',
      body: `Pronađeno je ${newOther.length} novih stranica (npr. ${newOther
        .slice(0, 3)
        .map((e) => new URL(e.url).pathname)
        .join(', ')}). Ponovite analizu da Sova nauči izmene.`,
      payload: { urls: newOther.slice(0, 20).map((e) => e.url) },
      evidence: { sitemap_changed: sitemapChanged, feed_changed: feedChanged },
      score: 60,
      expires_at: expires,
    })
  }
  if (rows.length) {
    const { error } = await admin.from('suggestions').insert(rows as never)
    if (error) logger.warn('site_check_suggestions_failed', { brandId, error })
  }

  await admin.from('brand_site_checks').insert({
    brand_id: brandId,
    sitemap_hash: sitemapHash,
    feed_hash: feedHash,
    new_urls: newEntries.slice(0, 200).map((e) => e.url),
    changed_urls: [],
    suggested_profile_update: profileUpdateSuggested,
  })
  await admin
    .from('brands')
    .update({ sitemap_hash: sitemapHash, feed_hash: feedHash, last_site_check_at: new Date().toISOString() })
    .eq('id', brandId)

  logger.info('site_check_done', {
    brandId,
    newUrls: newEntries.length,
    newPosts: newPosts.length,
    profileUpdateSuggested,
  })
  return {
    brandId,
    checked: true,
    newUrls: newEntries.length,
    newPosts: newPosts.length,
    profileUpdateSuggested,
  }
}
