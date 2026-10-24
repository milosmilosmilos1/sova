/**
 * Živi smoke test crawlera bez baze i bez AI-ja: čita pravi sajt i ispisuje heuristički profil.
 * Pokretanje: npx tsx scripts/crawl-smoke.ts https://tangerineseo.rs [maxPages]
 */
import { buildHeuristicProfile, type HeuristicPage } from '@/lib/brand/heuristic'
import { buildPalette, parseCssColors, type ColorWeight } from '@/lib/crawler/colors'
import { discoverUrls } from '@/lib/crawler/discover'
import { fetchPage, isFailure } from '@/lib/crawler/fetch-page'
import { extractFonts } from '@/lib/crawler/fonts'
import { fetchLogo } from '@/lib/crawler/logo'
import { loadRobots } from '@/lib/crawler/robots'
import type { CrawlDeps, ExtractedPage } from '@/lib/crawler/types'
import { normalizeUrl, safeFetch } from '@/lib/ssrf'

const target = process.argv[2] ?? 'https://tangerineseo.rs'
const maxPages = Number(process.argv[3] ?? 25)
const deps: CrawlDeps = { fetch: safeFetch, now: Date.now }
const limits = { timeoutMs: 10_000, maxBytes: 3 * 1024 * 1024 }

async function main() {
  const started = Date.now()
  const url = normalizeUrl(target)
  const robots = await loadRobots(url.origin, deps)
  console.log(
    `robots.txt: ${robots.fetched ? 'pročitan' : 'nema'}; sitemap: ${robots.sitemaps.length}; blokira sve: ${robots.blocksEverything}`,
  )
  if (robots.blocksEverything) return

  const home = await fetchPage(url.toString(), deps, limits)
  if (isFailure(home)) {
    console.log('Početna nije pročitana:', home)
    return
  }
  console.log(
    `početna: ${home.url} | ${home.title} | ${home.wordCount} reči | ${home.internalLinks.length} linkova | SPA: ${home.isSpaShell}`,
  )

  const discovered = await discoverUrls(home, robots.sitemaps, maxPages, deps)
  console.log(
    `otkriveno ${discovered.totalFound}, izabrano ${discovered.urls.length}, feed stavki ${discovered.feedItems.length}`,
  )
  const pages: ExtractedPage[] = [home]
  const failures: string[] = []
  const queue = discovered.urls.filter((u) => u.source !== 'seed' && robots.isAllowed(u.url))
  let i = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (;;) {
        const u = queue[i++]
        if (!u) return
        const p = await fetchPage(u.url, deps, limits)
        if (isFailure(p)) failures.push(`${u.url} → ${p.code}`)
        else pages.push(p)
      }
    }),
  )
  console.log(`preuzeto ${pages.length} strana, neuspelo ${failures.length}`)
  for (const f of failures.slice(0, 5)) console.log('  !', f)
  const byType: Record<string, number> = {}
  for (const p of pages) byType[p.type] = (byType[p.type] ?? 0) + 1
  console.log('tipovi:', byType)

  // vizuali
  const css: ColorWeight[] = parseCssColors(home.inlineCss, 1.5, 'inline')
  let allCss = home.inlineCss
  for (const s of home.stylesheets.filter((u) => !/googleapis/.test(u)).slice(0, 3)) {
    try {
      const res = await deps.fetch(s, {
        timeoutMs: 8_000,
        maxBytes: 768 * 1024,
        headers: { accept: 'text/css' },
      })
      if (res.ok) {
        allCss += `\n${res.body.toString('utf8')}`
        css.push(...parseCssColors(res.body.toString('utf8'), 1, s))
      }
    } catch (e) {
      console.log('  css greška', s, (e as Error).message)
    }
  }
  const logo = await fetchLogo(home.logoCandidates, deps)
  console.log(
    `logo: ${logo ? `${logo.sourceUrl} (${logo.mimeType}, ${logo.width}x${logo.height}, ${logo.reason})` : 'nije pronađen'}`,
  )
  const palette = buildPalette({ css, logo: [], themeColor: home.themeColor })
  const fonts = extractFonts(home.stylesheets, allCss)
  console.log('paleta:', palette.primary, palette.secondary, palette.accent, 'mono:', palette.isMonochrome)
  console.log('fontovi:', fonts.headings, '/', fonts.body, '→', fonts.mappedHeadings, '/', fonts.mappedBody)

  const hp: HeuristicPage[] = pages.map((p) => ({
    url: p.url,
    type: p.type,
    title: p.title,
    metaDescription: p.metaDescription,
    lang: p.lang,
    headings: p.headings,
    text: p.text,
    jsonLd: p.jsonLd,
    openGraph: p.openGraph,
    socialLinks: p.socialLinks,
    publishedAt: p.publishedAt,
  }))
  const profile = buildHeuristicProfile({
    brandName: home.title ?? url.hostname,
    websiteUrl: home.url,
    contentLocale: 'sr-Latn',
    pages: hp,
    feedItems: discovered.feedItems,
    visual: { logo: null, palette, fonts, photoStyle: null, photoStyleConfidence: 0 },
    crawlId: null,
  })
  const pick = (f: { value: unknown; confidence: number }) => `${JSON.stringify(f.value)} (${f.confidence})`
  console.log('--- heuristički profil ---')
  console.log('naziv:', pick(profile.identity.name))
  console.log('slogan:', pick(profile.identity.tagline))
  console.log('opis:', pick(profile.identity.description))
  console.log('lokacija:', pick(profile.identity.location), 'jezik:', pick(profile.identity.content_locale))
  console.log(
    'usluge:',
    profile.offer.services.value.map((s) => s.name),
  )
  console.log('razlike:', profile.offer.differentiators.value.slice(0, 3))
  console.log('cene:', profile.offer.price_hints.value.slice(0, 3))
  console.log(
    'činjenice:',
    profile.facts.value.slice(0, 4).map((f) => f.claim),
  )
  console.log(
    'kontakt:',
    profile.contact.email.value,
    profile.contact.phone.value,
    profile.contact.address.value,
  )
  console.log('mreže:', profile.social.value)
  console.log('obraćanje:', pick(profile.voice.address), 'emoji:', pick(profile.voice.emoji))
  console.log(
    'blog:',
    profile.content.has_blog.value,
    profile.content.recent_posts.value.slice(0, 3).map((p) => p.title),
  )
  console.log(
    'ukupna pouzdanost:',
    profile.meta.overall_confidence,
    `| trajanje ${Math.round((Date.now() - started) / 1000)} s`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
