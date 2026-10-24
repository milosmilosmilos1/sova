import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { fileTypeFromBuffer } from 'file-type'
import { Vibrant } from 'node-vibrant/node'
import robotsParser from 'robots-parser'
import sharp from 'sharp'

import { AiError, classifyProviderError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  aiOutputToFields,
  aiProfileOutputSchema,
  brandProfileJsonSchema,
  buildBrandProfilePrompt,
  buildBrandProfileSystemPrompt,
  buildCorpus,
} from '@/lib/ai/prompts/brand-profile'
import {
  buildPhotoStylePrompt,
  buildPhotoStyleSystemPrompt,
  photoStyleJsonSchema,
  photoStyleOutputSchema,
  toPhotoStyle,
} from '@/lib/ai/prompts/photo-style'
import { composeProfile } from '@/lib/brand/compose'
import { buildHeuristicProfile, type HeuristicPage, type HeuristicVisual } from '@/lib/brand/heuristic'
import type { BrandProfile, Field, FieldPath, PhotoStyle } from '@/lib/brand/profile-schema'
import { canonicalPageKey } from '@/lib/crawler/classify'
import { buildPalette, parseCssColors, type ColorWeight, type Palette } from '@/lib/crawler/colors'
import { getCrawlDeps } from '@/lib/crawler/deps'
import { discoverUrls } from '@/lib/crawler/discover'
import { fetchPage, isFailure, type PageFailure } from '@/lib/crawler/fetch-page'
import { extractFonts, type FontInfo } from '@/lib/crawler/fonts'
import { fetchLogo, type LogoResult } from '@/lib/crawler/logo'
import { loadRobots } from '@/lib/crawler/robots'
import type { DiscoveredUrl, ExtractedPage, FeedItem, ImageRef, LogoCandidate } from '@/lib/crawler/types'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { normalizeUrl, SsrfError } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { confirmReservation, releaseReservation } from '@/lib/tokens/reservation'
import {
  CRAWL_PHASES,
  loadCrawl,
  markCrawlFailed,
  setCrawlProgress,
  type CrawlProgress,
} from '@/services/brand-brain/crawl'
import { indexBrandPages, type IndexResult } from '@/services/brand-brain/embed'
import { getCurrentProfileRow, insertProfileVersion, parseProfile } from '@/services/brand-brain/profile'
import type { Json } from '@/types/database'

/**
 * Analiza sajta kao niz koraka (docs/ARCHITECTURE.md 3.5). Svaki korak je čista funkcija nad
 * bazom koju Inngest pamti (`step.run`), pa pad procesa nastavlja od poslednjeg koraka.
 * Deterministične greške (robots, 404, SPA) se vraćaju kao podaci, ne bacaju: tako ih
 * Inngest ne ponavlja uzalud. Mrežne greške koraka bacaju i Inngest ih ponavlja.
 */
export interface AnalysisJob {
  brandId: string
  crawlId: string
  workspaceId: string
  requestedBy: string | null
  generationId: string | null
}

export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>

export type PipelineStatus = 'succeeded' | 'partial' | 'failed' | 'canceled' | 'skipped'

interface Usage {
  inputTokens: number
  outputTokens: number
  thoughtTokens: number
}
const ZERO: Usage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }

type Fail = { ok: false; code: string; message: string; robotsBlocked?: boolean }
type Skipped = { ok: false; code: 'SKIPPED'; message: string }

interface HomeInfo {
  url: string
  stylesheets: string[]
  inlineCss: string
  themeColor: string | null
  logoCandidates: LogoCandidate[]
  images: ImageRef[]
  feedLinks: string[]
  internalLinks: string[]
}

interface PrepareResult {
  ok: true
  origin: string
  homeUrl: string
  robotsText: string | null
  sitemaps: string[]
  crawlDelayMs: number | null
  limits: {
    maxPages: number
    concurrency: number
    pageTimeoutMs: number
    maxHtmlBytes: number
    totalTimeoutMs: number
  }
  home: HomeInfo
  brand: {
    name: string
    contentLocale: BrandProfile['identity']['content_locale']['value']
    workspaceId: string
  }
  startedAt: number
}

interface DiscoverStep {
  urls: DiscoveredUrl[]
  feedItems: FeedItem[]
  sitemapHash: string | null
  feedHash: string | null
  totalFound: number
}

interface FetchStep {
  fetched: number
  failures: Array<{ url: string; code: PageFailure['code'] }>
}

interface VisualStep {
  logo: { assetId: string; sourceUrl: string; mimeType: string } | null
  palette: Palette
  fonts: FontInfo
}

interface PhotoStyleStep {
  photoStyle: PhotoStyle | null
  confidence: number
  model: string | null
  usage: Usage
  images: number
  skipped: string | null
}

interface ProfileStep {
  ok: true
  profileId: string
  version: number
  generatedBy: BrandProfile['meta']['generated_by']
  model: string | null
  usage: Usage
  fallbackUsed: boolean
  aiError: string | null
  pagesUsed: number
}

interface EmbedStep extends IndexResult {
  error: string | null
}

const FETCH_BATCH = 10

export async function runAnalysisPipeline(
  job: AnalysisJob,
  run: StepRunner,
): Promise<{ status: PipelineStatus }> {
  const prepared = await run('prepare', () => stepPrepare(job))
  if (!prepared.ok) {
    if (prepared.code === 'SKIPPED') return { status: 'skipped' }
    await run('finish-failed', () => finishFailed(job, prepared))
    return { status: 'failed' }
  }

  const discovered = await run('discover', () => stepDiscover(job, prepared))

  const batches: DiscoveredUrl[][] = []
  for (let i = 0; i < discovered.urls.length; i += FETCH_BATCH)
    batches.push(discovered.urls.slice(i, i + FETCH_BATCH))
  const totals: FetchStep = { fetched: 0, failures: [] }
  let timedOut = false
  for (let i = 0; i < batches.length; i++) {
    if (Date.now() - prepared.startedAt > prepared.limits.totalTimeoutMs) {
      timedOut = true
      break
    }
    const r = await run(`fetch-batch-${i + 1}`, () =>
      stepFetchBatch(job, prepared, batches[i]!, totals.fetched, discovered.urls.length + 1),
    )
    if (r.ok === false) return { status: 'canceled' }
    totals.fetched += r.fetched
    totals.failures.push(...r.failures)
  }

  const visual = await run('visual', () => stepVisual(job, prepared))
  const photo = await run('photo-style', () => stepPhotoStyle(job, prepared, visual))
  const profile = await run('profile', () => stepProfile(job, prepared, discovered, visual, photo))
  if (!profile.ok) return { status: 'canceled' }
  const embed = await run('embed', () => stepEmbed(job))
  return run('finish', () =>
    stepFinish(job, { prepared, discovered, totals, timedOut, visual, photo, profile, embed }),
  )
}

// ---------------------------------------------------------------------------------------------
// prepare

const FAILURE_TEXT: Record<PageFailure['code'], string> = {
  CHALLENGE: 'Sajt traži proveru pregledača (Cloudflare ili slična zaštita), pa Sova ne može da ga pročita.',
  HTTP_ERROR: 'Sajt je vratio grešku umesto stranice.',
  TIMEOUT: 'Sajt nije odgovorio na vreme.',
  NOT_HTML: 'Na toj adresi nije HTML stranica.',
  BLOCKED: 'Adresa pokazuje na mrežu koju Sova ne sme da čita.',
  TOO_LARGE: 'Početna strana je prevelika za čitanje.',
  FETCH_FAILED: 'Sajt nije dostupan (domen ne postoji ili server ne odgovara).',
}
const MANUAL_HINT = ' Proverite adresu, ili unesite podatke o brendu ručno.'

async function stepPrepare(job: AnalysisJob): Promise<PrepareResult | Fail | Skipped> {
  const crawl = await loadCrawl(job.crawlId)
  if (!crawl) return { ok: false, code: 'SKIPPED', message: 'Analiza ne postoji.' }
  if (crawl.status !== 'queued' && crawl.status !== 'running') {
    return { ok: false, code: 'SKIPPED', message: `Analiza je već u stanju ${crawl.status}.` }
  }
  const admin = createSupabaseAdminClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, name, content_locale, workspace_id, deleted_at')
    .eq('id', job.brandId)
    .maybeSingle()
  if (!brand || brand.deleted_at)
    return { ok: false, code: 'BRAND_MISSING', message: 'Brend više ne postoji.' }

  const now = new Date().toISOString()
  await admin
    .from('website_crawls')
    .update({ status: 'running', started_at: crawl.started_at ?? now })
    .eq('id', crawl.id)
  await setCrawlProgress(crawl.id, { phase: 'prepare' })
  if (job.generationId) {
    await admin
      .from('ai_generations')
      .update({ status: 'running', started_at: now })
      .eq('id', job.generationId)
  }

  const deps = getCrawlDeps()
  let url: URL
  try {
    url = normalizeUrl(crawl.url)
  } catch (error) {
    return { ok: false, code: 'INVALID_URL', message: (error as Error).message }
  }

  let robots
  try {
    robots = await loadRobots(url.origin, deps)
  } catch (error) {
    if (error instanceof SsrfError)
      return { ok: false, code: 'BLOCKED', message: error.message + MANUAL_HINT }
    throw error
  }
  if (robots.blocksEverything) {
    await admin.from('website_crawls').update({ robots_blocked: true }).eq('id', crawl.id)
    return {
      ok: false,
      code: 'ROBOTS_BLOCKED',
      robotsBlocked: true,
      message:
        'Sajt u robots.txt zabranjuje čitanje botovima, a Sova to poštuje. Dozvolite „SovaBot” u robots.txt ili unesite podatke ručno.',
    }
  }

  const limits = {
    maxPages: crawl.page_limit,
    concurrency: robots.crawlDelayMs ? 1 : 3,
    pageTimeoutMs: 10_000,
    maxHtmlBytes: 3 * 1024 * 1024,
    totalTimeoutMs: 5 * 60_000,
  }
  const page = await fetchPage(url.toString(), deps, {
    timeoutMs: limits.pageTimeoutMs,
    maxBytes: limits.maxHtmlBytes,
  })
  if (isFailure(page)) {
    const detail = page.code === 'HTTP_ERROR' && page.status ? ` (HTTP ${page.status})` : ''
    return { ok: false, code: page.code, message: `${FAILURE_TEXT[page.code]}${detail}${MANUAL_HINT}` }
  }
  if (page.isSpaShell) {
    return {
      ok: false,
      code: 'SPA_SHELL',
      message: 'Sajt se učitava JavaScriptom i nema čitljiv tekst za Sovu.' + MANUAL_HINT,
    }
  }
  if (page.wordCount < 10 && page.internalLinks.length === 0) {
    return { ok: false, code: 'EMPTY', message: 'Početna strana nema čitljiv sadržaj.' + MANUAL_HINT }
  }

  const finalUrl = new URL(page.url)
  if (finalUrl.toString() !== crawl.url) {
    await admin.from('website_crawls').update({ url: finalUrl.toString() }).eq('id', crawl.id)
  }
  if (finalUrl.origin !== url.origin) {
    // preusmereno na drugi host (npr. www): robots tog hosta važi dalje
    try {
      robots = await loadRobots(finalUrl.origin, deps)
    } catch {
      // zadrži prethodni
    }
  }
  await upsertPage(job, page)

  return {
    ok: true,
    origin: finalUrl.origin,
    homeUrl: page.url,
    robotsText: robots.text ? robots.text.slice(0, 64_000) : null,
    sitemaps: robots.sitemaps.slice(0, 10),
    crawlDelayMs: robots.crawlDelayMs,
    limits,
    home: {
      url: page.url,
      stylesheets: page.stylesheets.slice(0, 8),
      inlineCss: page.inlineCss.slice(0, 120_000),
      themeColor: page.themeColor,
      logoCandidates: page.logoCandidates.slice(0, 12),
      images: page.images.slice(0, 40),
      feedLinks: page.feedLinks,
      internalLinks: page.internalLinks.slice(0, 400),
    },
    brand: {
      name: brand.name,
      contentLocale: brand.content_locale as BrandProfile['identity']['content_locale']['value'],
      workspaceId: brand.workspace_id,
    },
    startedAt: Date.now(),
  }
}

function robotsAllows(prepared: PrepareResult): (url: string) => boolean {
  if (!prepared.robotsText) return () => true
  const parser = robotsParser(new URL('/robots.txt', prepared.origin).toString(), prepared.robotsText)
  return (url) => parser.isAllowed(url, 'SovaBot') ?? true
}

function toIso(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function upsertPage(job: AnalysisJob, page: ExtractedPage): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('website_pages')
    .upsert(
      {
        brand_id: job.brandId,
        crawl_id: job.crawlId,
        url: page.url,
        canonical_url: page.canonicalUrl,
        page_type: page.type,
        title: page.title,
        meta_description: page.metaDescription,
        lang: page.lang,
        headings: page.headings as unknown as NonNullable<Json>,
        text_content: page.text,
        word_count: page.wordCount,
        images: page.images.slice(0, 40) as unknown as NonNullable<Json>,
        json_ld: page.jsonLd.slice(0, 20) as unknown as NonNullable<Json>,
        open_graph: page.openGraph as unknown as NonNullable<Json>,
        social_links: page.socialLinks as unknown as NonNullable<Json>,
        published_at: toIso(page.publishedAt),
        content_hash: page.contentHash,
        http_status: page.httpStatus,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,url' },
    )
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// ---------------------------------------------------------------------------------------------
// discover + fetch

async function stepDiscover(job: AnalysisJob, prepared: PrepareResult): Promise<DiscoverStep> {
  await setCrawlProgress(job.crawlId, { phase: 'discover' })
  const deps = getCrawlDeps()
  const result = await discoverUrls(prepared.home, prepared.sitemaps, prepared.limits.maxPages, deps)
  const allowed = robotsAllows(prepared)
  const homeKey = canonicalPageKey(new URL(prepared.homeUrl))
  const urls = result.urls.filter(
    (u) => u.source !== 'seed' && canonicalPageKey(new URL(u.url)) !== homeKey && allowed(u.url),
  )
  const pagesFound = urls.length + 1
  await setCrawlProgress(
    job.crawlId,
    { phase: 'fetch', message: `Preuzimam stranice (1/${pagesFound})`, pagesFound, pagesFetched: 1 },
    { pages_found: pagesFound, pages_fetched: 1 },
  )
  return {
    urls,
    feedItems: result.feedItems.slice(0, 30),
    sitemapHash: result.sitemapHash,
    feedHash: result.feedHash,
    totalFound: result.totalFound,
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (;;) {
      const idx = next++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx]!)
    }
  })
  await Promise.all(workers)
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function isCanceled(crawlId: string): Promise<boolean> {
  const crawl = await loadCrawl(crawlId)
  return !crawl || crawl.status === 'canceled'
}

async function stepFetchBatch(
  job: AnalysisJob,
  prepared: PrepareResult,
  batch: DiscoveredUrl[],
  fetchedBefore: number,
  pagesFound: number,
): Promise<FetchStep & { ok?: false }> {
  if (await isCanceled(job.crawlId)) return { ok: false, fetched: 0, failures: [] }
  const deps = getCrawlDeps()
  const results = await pool(batch, prepared.limits.concurrency, async (u) => {
    if (prepared.crawlDelayMs) await sleep(prepared.crawlDelayMs)
    const page = await fetchPage(u.url, deps, {
      timeoutMs: prepared.limits.pageTimeoutMs,
      maxBytes: prepared.limits.maxHtmlBytes,
    })
    if (isFailure(page)) return { ok: false as const, url: u.url, code: page.code }
    if (page.isSpaShell) return { ok: false as const, url: u.url, code: 'NOT_HTML' as const }
    await upsertPage(job, page)
    return { ok: true as const }
  })
  const fetched = results.filter((r) => r.ok).length
  const failures = results.flatMap((r) => (r.ok ? [] : [{ url: r.url, code: r.code }]))
  const total = 1 + fetchedBefore + fetched
  const percent = Math.round(CRAWL_PHASES.fetch.percent + 45 * Math.min(1, total / Math.max(1, pagesFound)))
  await setCrawlProgress(
    job.crawlId,
    {
      phase: 'fetch',
      message: `Preuzimam stranice (${total}/${pagesFound})`,
      percent,
      pagesFound,
      pagesFetched: total,
    },
    { pages_fetched: total },
  )
  return { fetched, failures }
}

// ---------------------------------------------------------------------------------------------
// visual

const LOGO_MIME_OK = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

async function storeLogo(job: AnalysisJob, logo: LogoResult): Promise<VisualStep['logo']> {
  const admin = createSupabaseAdminClient()
  const usePng = !LOGO_MIME_OK.has(logo.mimeType)
  const bytes = usePng ? logo.png : logo.bytes
  const mimeType = usePng ? 'image/png' : logo.mimeType
  const ext =
    mimeType === 'image/svg+xml'
      ? 'svg'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'png'
  const id = randomUUID()
  const storagePath = `ws/${job.workspaceId}/brand/${job.brandId}/logo/${id}.${ext}`
  const upload = await admin.storage
    .from('brand-assets')
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (upload.error) {
    logger.warn('logo_upload_failed', { crawlId: job.crawlId, error: upload.error })
    return null
  }
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: job.workspaceId,
    brand_id: job.brandId,
    kind: 'image',
    source: 'upload',
    bucket: 'brand-assets',
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: bytes.length,
    width: logo.width,
    height: logo.height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    alt_text: 'Logo',
    tags: ['logo'],
    attribution: { source: 'website', url: logo.sourceUrl, reason: logo.reason },
    is_ai_generated: false,
    uploaded_by: null,
  })
  if (error) {
    logger.warn('logo_asset_insert_failed', { crawlId: job.crawlId, error })
    await admin.storage.from('brand-assets').remove([storagePath])
    return null
  }
  return { assetId: id, sourceUrl: logo.sourceUrl, mimeType }
}

async function stepVisual(job: AnalysisJob, prepared: PrepareResult): Promise<VisualStep> {
  if (await isCanceled(job.crawlId)) {
    return { logo: null, palette: buildPalette({ css: [], logo: [] }), fonts: extractFonts([], '') }
  }
  await setCrawlProgress(job.crawlId, { phase: 'visual' })
  const deps = getCrawlDeps()
  const home = prepared.home
  const cssColors: ColorWeight[] = parseCssColors(home.inlineCss, 1.5, 'inline')
  let allCss = home.inlineCss
  const sheets = home.stylesheets
    .filter((u) => !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u))
    .slice(0, 3)
  for (const sheetUrl of sheets) {
    try {
      const res = await deps.fetch(sheetUrl, {
        timeoutMs: 8_000,
        maxBytes: 768 * 1024,
        headers: { accept: 'text/css,*/*;q=0.1' },
      })
      if (!res.ok || res.contentType.includes('text/html')) continue
      const css = res.body.toString('utf8')
      allCss += `\n${css}`
      cssColors.push(...parseCssColors(css, 1, sheetUrl))
    } catch {
      continue
    }
  }

  let logoInfo: VisualStep['logo'] = null
  const logoColors: ColorWeight[] = []
  const logo = await fetchLogo(home.logoCandidates, deps)
  if (logo) {
    try {
      const palette = await Vibrant.from(logo.png).getPalette()
      for (const [name, swatch] of Object.entries(palette)) {
        if (!swatch) continue
        const weight =
          Math.max(1, Math.log2(1 + swatch.population)) *
          (name === 'Vibrant' ? 2 : name === 'DarkVibrant' || name === 'LightVibrant' ? 1.3 : 0.6)
        logoColors.push({ hex: swatch.hex, weight, source: 'logo' })
      }
    } catch (error) {
      logger.warn('logo_palette_failed', { crawlId: job.crawlId, error })
    }
    logoInfo = await storeLogo(job, logo)
  }

  const palette = buildPalette({ css: cssColors, logo: logoColors, themeColor: home.themeColor })
  const fonts = extractFonts(home.stylesheets, allCss)
  return { logo: logoInfo, palette, fonts }
}

// ---------------------------------------------------------------------------------------------
// photo style

const IMAGE_SKIP =
  /logo|icon|sprite|avatar|flag|badge|placeholder|pixel|tracking|emoji|arrow|bullet|spinner|loader|captcha|qr|\.svg(\?|$)|\.gif(\?|$)|\.ico(\?|$)|data:/i
const PHOTO_PAGE_TYPES = new Set([
  'home',
  'about',
  'services',
  'products',
  'portfolio',
  'case_study',
  'team',
  'reviews',
])

async function stepPhotoStyle(
  job: AnalysisJob,
  prepared: PrepareResult,
  visual: VisualStep,
): Promise<PhotoStyleStep> {
  const base: PhotoStyleStep = {
    photoStyle: null,
    confidence: 0,
    model: null,
    usage: ZERO,
    images: 0,
    skipped: null,
  }
  if (!env.GEMINI_API_KEY) return { ...base, skipped: 'AI servis nije podešen (nedostaje ključ).' }
  if (await isCanceled(job.crawlId)) return { ...base, skipped: 'Otkazano.' }
  await setCrawlProgress(job.crawlId, { phase: 'photo_style' })

  const admin = createSupabaseAdminClient()
  const { data: pages } = await admin
    .from('website_pages')
    .select('page_type, images')
    .eq('crawl_id', job.crawlId)
  const candidates: ImageRef[] = []
  const seen = new Set<string>()
  const ordered = [...(pages ?? [])].sort((a, b) =>
    a.page_type === 'home' ? -1 : b.page_type === 'home' ? 1 : 0,
  )
  for (const p of ordered) {
    if (!PHOTO_PAGE_TYPES.has(p.page_type)) continue
    for (const img of (p.images as unknown as ImageRef[] | null) ?? []) {
      if (!img?.src || seen.has(img.src) || IMAGE_SKIP.test(`${img.src} ${img.alt}`)) continue
      if (visual.logo && img.src === visual.logo.sourceUrl) continue
      if ((img.width && img.width < 300) || (img.height && img.height < 200)) continue
      seen.add(img.src)
      candidates.push(img)
      if (candidates.length >= 14) break
    }
    if (candidates.length >= 14) break
  }
  if (candidates.length < 3) return { ...base, skipped: 'Sajt nema dovoljno fotografija za procenu stila.' }

  const deps = getCrawlDeps()
  const images: ImageInput[] = []
  for (const c of candidates) {
    if (images.length >= 8) break
    try {
      const res = await deps.fetch(c.src, {
        timeoutMs: 8_000,
        maxBytes: 4 * 1024 * 1024,
        headers: { accept: 'image/*' },
      })
      if (!res.ok) continue
      const type = await fileTypeFromBuffer(res.body)
      if (!type || !/^image\/(jpeg|png|webp)$/.test(type.mime)) continue
      const meta = await sharp(res.body, { limitInputPixels: 40_000_000 }).metadata()
      if (!meta.width || !meta.height || meta.width < 300 || meta.height < 200) continue
      const small = await sharp(res.body)
        .rotate()
        .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()
      images.push({ data: small.toString('base64'), mimeType: 'image/jpeg' })
    } catch {
      continue
    }
  }
  if (images.length < 3) return { ...base, skipped: 'Fotografije sa sajta nisu mogle da se preuzmu.' }

  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPhotoStyleSystemPrompt(),
          prompt: buildPhotoStylePrompt(images.length, prepared.brand.name),
          images,
          jsonSchema: photoStyleJsonSchema(),
          maxOutputTokens: 1024,
          temperature: 0.4,
          thinking: 'low',
          timeoutMs: 60_000,
        }),
      { label: 'photo-style' },
    )
    const parsed = photoStyleOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success)
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    return {
      photoStyle: toPhotoStyle(parsed.data),
      confidence: Math.max(0, Math.min(1, parsed.data.confidence)),
      model: outcome.model,
      usage: {
        inputTokens: outcome.result.usage.inputTokens,
        outputTokens: outcome.result.usage.outputTokens,
        thoughtTokens: outcome.result.usage.thoughtTokens,
      },
      images: images.length,
      skipped: null,
    }
  } catch (error) {
    const ai = classifyProviderError(error)
    logger.warn('photo_style_failed', { crawlId: job.crawlId, code: ai.code })
    return { ...base, images: images.length, skipped: `Stil fotografija nije procenjen: ${ai.message}` }
  }
}

// ---------------------------------------------------------------------------------------------
// profile

function rowToHeuristicPage(r: {
  url: string
  page_type: HeuristicPage['type']
  title: string | null
  meta_description: string | null
  lang: string | null
  headings: Json | null
  text_content: string | null
  json_ld: Json | null
  open_graph: Json | null
  social_links: Json | null
  published_at: string | null
}): HeuristicPage {
  return {
    url: r.url,
    type: r.page_type,
    title: r.title,
    metaDescription: r.meta_description,
    lang: r.lang,
    headings: (r.headings as HeuristicPage['headings']) ?? null,
    text: r.text_content ?? '',
    jsonLd: Array.isArray(r.json_ld) ? (r.json_ld as unknown[]) : [],
    openGraph: (r.open_graph as Record<string, string> | null) ?? {},
    socialLinks: (r.social_links as Record<string, string> | null) ?? {},
    publishedAt: r.published_at,
  }
}

async function loadPages(crawlId: string): Promise<HeuristicPage[]> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('website_pages')
    .select(
      'url, page_type, title, meta_description, lang, headings, text_content, json_ld, open_graph, social_links, published_at',
    )
    .eq('crawl_id', crawlId)
    .order('fetched_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(rowToHeuristicPage)
}

async function stepProfile(
  job: AnalysisJob,
  prepared: PrepareResult,
  discovered: DiscoverStep,
  visual: VisualStep,
  photo: PhotoStyleStep,
): Promise<ProfileStep | { ok: false }> {
  if (await isCanceled(job.crawlId)) return { ok: false }
  await setCrawlProgress(job.crawlId, { phase: 'profile' })
  const pages = await loadPages(job.crawlId)
  const visualInput: HeuristicVisual = {
    logo: visual.logo
      ? { assetId: visual.logo.assetId, sourceUrl: visual.logo.sourceUrl, mimeType: visual.logo.mimeType }
      : null,
    palette: visual.palette,
    fonts: visual.fonts,
    photoStyle: photo.photoStyle,
    photoStyleConfidence: photo.confidence,
  }
  const heuristic = buildHeuristicProfile({
    brandName: prepared.brand.name,
    websiteUrl: prepared.homeUrl,
    contentLocale: prepared.brand.contentLocale,
    pages,
    feedItems: discovered.feedItems,
    visual: visualInput,
    crawlId: job.crawlId,
  })

  let ai: Partial<Record<FieldPath, Field<unknown>>> | null = null
  let model: string | null = null
  let usage: Usage = ZERO
  let fallbackUsed = false
  let aiError: string | null = null
  let pagesUsed = pages.length
  if (env.GEMINI_API_KEY) {
    const corpus = buildCorpus(pages.map((p) => ({ url: p.url, type: p.type, title: p.title, text: p.text })))
    pagesUsed = corpus.used
    try {
      const outcome = await callWithFallback(
        await textModelChain(),
        (m) =>
          generateText({
            model: m,
            system: buildBrandProfileSystemPrompt(),
            prompt: buildBrandProfilePrompt({
              brandName: prepared.brand.name,
              websiteUrl: prepared.homeUrl,
              corpus: corpus.text,
              pageCount: corpus.used,
            }),
            jsonSchema: brandProfileJsonSchema(),
            maxOutputTokens: 8192,
            temperature: 0.3,
            thinking: 'medium',
            timeoutMs: 120_000,
          }),
        { label: 'brand-profile' },
      )
      const parsed = aiProfileOutputSchema.safeParse(outcome.result.json)
      if (!parsed.success) {
        throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi profila.', {
          model: outcome.model,
        })
      }
      ai = aiOutputToFields(parsed.data)
      model = outcome.model
      fallbackUsed = outcome.fallbackUsed
      usage = {
        inputTokens: outcome.result.usage.inputTokens,
        outputTokens: outcome.result.usage.outputTokens,
        thoughtTokens: outcome.result.usage.thoughtTokens,
      }
    } catch (error) {
      const e = classifyProviderError(error)
      aiError = e.message
      logger.warn('brand_profile_ai_failed', { crawlId: job.crawlId, code: e.code })
    }
  } else {
    aiError = 'AI servis nije podešen (nedostaje ključ); profil je sastavljen heuristički.'
  }

  const prevRow = await getCurrentProfileRow(job.brandId)
  const previous = prevRow
    ? parseProfile(prevRow.data, {
        name: prepared.brand.name,
        contentLocale: prepared.brand.contentLocale,
        websiteUrl: prepared.homeUrl,
      })
    : null
  const profile = composeProfile({
    heuristic,
    ai,
    previous,
    lockedFields: prevRow?.locked_fields ?? [],
    meta: {
      generated_by: ai ? 'ai' : 'heuristic',
      model,
      crawl_id: job.crawlId,
      pages_used: pagesUsed,
      source_url: prepared.homeUrl,
    },
  })
  const inserted = await insertProfileVersion({
    brandId: job.brandId,
    profile,
    lockedFields: prevRow?.locked_fields ?? [],
    crawlId: job.crawlId,
    createdBy: null,
  })

  const admin = createSupabaseAdminClient()
  await admin
    .from('brands')
    .update({
      sitemap_hash: discovered.sitemapHash,
      feed_hash: discovered.feedHash,
      last_site_check_at: new Date().toISOString(),
      ...(visual.logo ? { logo_asset_id: visual.logo.assetId } : {}),
    })
    .eq('id', job.brandId)

  return {
    ok: true,
    profileId: inserted.id,
    version: inserted.version,
    generatedBy: profile.meta.generated_by,
    model,
    usage,
    fallbackUsed,
    aiError,
    pagesUsed,
  }
}

// ---------------------------------------------------------------------------------------------
// embed + finish

async function stepEmbed(job: AnalysisJob): Promise<EmbedStep> {
  await setCrawlProgress(job.crawlId, { phase: 'embed' })
  try {
    const r = await indexBrandPages(job.brandId, job.crawlId)
    return { ...r, error: null }
  } catch (error) {
    const e = classifyProviderError(error)
    logger.warn('brand_embed_failed', { crawlId: job.crawlId, code: e.code })
    return {
      indexed: 0,
      skipped: 0,
      removed: 0,
      pages: 0,
      embedded: false,
      usage: { inputTokens: 0 },
      error: e.message,
    }
  }
}

interface FinishInput {
  prepared: PrepareResult
  discovered: DiscoverStep
  totals: FetchStep
  timedOut: boolean
  visual: VisualStep
  photo: PhotoStyleStep
  profile: ProfileStep
  embed: EmbedStep
}

async function stepFinish(job: AnalysisJob, input: FinishInput): Promise<{ status: PipelineStatus }> {
  const crawl = await loadCrawl(job.crawlId)
  if (!crawl || crawl.status === 'canceled') return { status: 'canceled' }
  const admin = createSupabaseAdminClient()

  const pagesFetched = 1 + input.totals.fetched
  const pagesFound = input.discovered.urls.length + 1
  const failures = input.totals.failures.length
  const notes: string[] = []
  if (input.profile.aiError) notes.push(input.profile.aiError)
  if (input.photo.skipped) notes.push(input.photo.skipped)
  if (!input.embed.embedded) notes.push(input.embed.error ?? input.embed.reason ?? 'Sadržaj nije indeksiran.')
  if (input.timedOut) notes.push('Isteklo je vreme za čitanje; deo stranica je preskočen.')
  if (failures > 0)
    notes.push(`${failures} ${failures === 1 ? 'stranica nije mogla' : 'stranica nije moglo'} da se preuzme.`)
  const usedAi = input.profile.generatedBy === 'ai'
  const complete =
    usedAi && input.embed.embedded && !input.timedOut && failures <= Math.ceil(pagesFound * 0.3)
  const status: PipelineStatus = complete ? 'succeeded' : 'partial'

  const summary: CrawlProgress['summary'] = {
    profileVersion: input.profile.version,
    generatedBy: input.profile.generatedBy,
    model: input.profile.model,
    pagesUsed: input.profile.pagesUsed,
    logo: Boolean(input.visual.logo),
    photoStyle: Boolean(input.photo.photoStyle),
    chunks: input.embed.indexed + input.embed.skipped,
    notes,
  }
  const progress: CrawlProgress = {
    phase: 'finish',
    message: status === 'succeeded' ? 'Gotovo' : 'Gotovo, uz napomene',
    percent: 100,
    pagesFound,
    pagesFetched,
    failures,
    summary,
  }
  await admin
    .from('website_crawls')
    .update({
      status,
      finished_at: new Date().toISOString(),
      pages_found: pagesFound,
      pages_fetched: pagesFetched,
      phase: 'finish',
      progress: progress as unknown as NonNullable<Json>,
      error_code: null,
      error_message: notes.length ? notes.join(' ').slice(0, 1000) : null,
    })
    .eq('id', job.crawlId)

  if (job.generationId) {
    const { data: gen } = await admin
      .from('ai_generations')
      .select('token_reservation_id, status')
      .eq('id', job.generationId)
      .maybeSingle()
    const usage: Usage = {
      inputTokens:
        input.profile.usage.inputTokens + input.photo.usage.inputTokens + input.embed.usage.inputTokens,
      outputTokens: input.profile.usage.outputTokens + input.photo.usage.outputTokens,
      thoughtTokens: input.profile.usage.thoughtTokens + input.photo.usage.thoughtTokens,
    }
    let cost = 0
    if (input.profile.model) cost += await costFor(input.profile.model, input.profile.usage)
    if (input.photo.model) cost += await costFor(input.photo.model, input.photo.usage)
    await admin
      .from('ai_generations')
      .update({
        model: input.profile.model,
        fallback_used: input.profile.fallbackUsed,
        output: { crawlId: job.crawlId, ...summary, status } as unknown as NonNullable<Json>,
        duration_ms: Date.now() - input.prepared.startedAt,
        provider_input_tokens: usage.inputTokens,
        provider_output_tokens: usage.outputTokens + usage.thoughtTokens,
        cost_usd: cost,
        progress: null,
      })
      .eq('id', job.generationId)
    if (gen && (gen.status === 'queued' || gen.status === 'running')) {
      if (gen.token_reservation_id && usedAi) {
        await confirmReservation(gen.token_reservation_id)
      } else {
        if (gen.token_reservation_id) await releaseReservation(gen.token_reservation_id, 'HEURISTIC_ONLY')
        await admin
          .from('ai_generations')
          .update({ status: 'succeeded', tokens_charged: 0, finished_at: new Date().toISOString() })
          .eq('id', job.generationId)
      }
    }
  }

  if (job.requestedBy) {
    await admin.from('notifications').insert({
      user_id: job.requestedBy,
      workspace_id: job.workspaceId,
      brand_id: job.brandId,
      type: 'brand_analysis_finished',
      title: status === 'succeeded' ? 'Analiza sajta je gotova' : 'Analiza sajta je gotova, uz napomene',
      body: `Profil brenda (verzija ${input.profile.version}) je spreman na osnovu ${pagesFetched} ${pagesFetched === 1 ? 'stranice' : 'stranica'}.`,
      data: { crawlId: job.crawlId, brandId: job.brandId, status, notes } as unknown as NonNullable<Json>,
    })
  }

  logger.info('brand_analyze_finished', {
    crawlId: job.crawlId,
    status,
    pagesFetched,
    failures,
    generatedBy: input.profile.generatedBy,
  })
  return { status }
}

async function finishFailed(job: AnalysisJob, fail: Fail): Promise<void> {
  await markCrawlFailed(job.crawlId, fail.code, fail.message)
  if (job.requestedBy) {
    const admin = createSupabaseAdminClient()
    await admin.from('notifications').insert({
      user_id: job.requestedBy,
      workspace_id: job.workspaceId,
      brand_id: job.brandId,
      type: 'brand_analysis_failed',
      title: 'Analiza sajta nije uspela',
      body: fail.message,
      data: { crawlId: job.crawlId, brandId: job.brandId, code: fail.code } as unknown as NonNullable<Json>,
    })
  }
}
