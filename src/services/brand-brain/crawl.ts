import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueBrandAnalysis, sendBrandAnalysisCanceled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { AnalyzeRequestInput } from '@/lib/schemas/brand'
import { assertHostnameSyntax, normalizeUrl, SsrfError } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { releaseReservation } from '@/lib/tokens/reservation'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrand } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import type { Database, Json } from '@/types/database'

export type CrawlRow = Database['public']['Tables']['website_crawls']['Row']
export type CrawlStatus = Database['public']['Enums']['crawl_status']

/** Faze i poruke koje vidi korisnik (brif 5.1, Realtime napredak). */
export const CRAWL_PHASES = {
  queued: { message: 'U redu za obradu', percent: 0 },
  prepare: { message: 'Čitam sajt', percent: 5 },
  discover: { message: 'Tražim stranice', percent: 12 },
  fetch: { message: 'Preuzimam stranice', percent: 20 },
  visual: { message: 'Izvlačim logo, boje i fontove', percent: 65 },
  photo_style: { message: 'Gledam fotografije', percent: 72 },
  profile: { message: 'Sastavljam profil brenda', percent: 80 },
  embed: { message: 'Pamtim sadržaj sajta', percent: 92 },
  finish: { message: 'Gotovo', percent: 100 },
} as const
export type CrawlPhase = keyof typeof CRAWL_PHASES

export interface CrawlProgress {
  phase: CrawlPhase
  message: string
  percent: number
  pagesFound?: number
  pagesFetched?: number
  failures?: number
  summary?: Record<string, Json | undefined>
}

export interface AnalyzeRequestResult {
  crawlId: string
  generationId: string
  tokensCharged: number
  status: 'queued'
  firstAnalysis: boolean
}

/**
 * Zahtev za analizu sajta (brif 5.1): sinhrono samo provera, rezervacija tokena i red u
 * website_crawls; ostatak radi Inngest funkcija `brand-analyze`. Prva analiza je besplatna,
 * svaka sledeća košta `brand_analyze_again` tokena (D-032).
 */
export async function requestAnalysis(
  viewer: Viewer,
  brandId: string,
  input: AnalyzeRequestInput,
  meta: { requestId: string; idempotencyKey: string | null },
): Promise<AnalyzeRequestResult> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')

  const rawUrl = input.websiteUrl ?? brand.website_url
  if (!rawUrl) {
    throw new ApiError('VALIDATION', 'Unesite adresu sajta koji Sova treba da pročita.', {
      fields: { websiteUrl: ['obavezno'] },
    })
  }
  let url: URL
  try {
    url = normalizeUrl(rawUrl)
    assertHostnameSyntax(url.hostname)
  } catch (error) {
    if (error instanceof SsrfError) {
      throw new ApiError('VALIDATION', error.message, { fields: { websiteUrl: [error.message] } })
    }
    throw error
  }

  const admin = createSupabaseAdminClient()
  const { data: active } = await admin
    .from('website_crawls')
    .select('id')
    .eq('brand_id', brand.id)
    .in('status', ['queued', 'running'])
    .maybeSingle()
  if (active) {
    throw new ApiError('CONFLICT', 'Analiza ovog sajta je već u toku. Sačekajte da se završi.', {
      details: { crawlId: active.id },
    })
  }

  const { count: doneCount } = await admin
    .from('website_crawls')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .in('status', ['succeeded', 'partial'])
  const firstAnalysis = (doneCount ?? 0) === 0
  const price = await getTokenPrice(firstAnalysis ? 'brand_analyze_first' : 'brand_analyze_again')
  const plan = await getWorkspacePlan(brand.workspace_id)
  const pageLimit = Math.max(5, Math.min(plan.limits.crawl_pages, 120))

  if (url.toString() !== brand.website_url) {
    await admin.from('brands').update({ website_url: url.toString() }).eq('id', brand.id)
  }

  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'brand_profile',
    tokens: price,
    status: 'queued',
    input: { url: url.toString(), pageLimit, firstAnalysis },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey,
  })

  const progress: CrawlProgress = { phase: 'queued', ...CRAWL_PHASES.queued }
  const inserted = await admin
    .from('website_crawls')
    .insert({
      brand_id: brand.id,
      url: url.toString(),
      status: 'queued',
      phase: 'queued',
      progress: progress as unknown as NonNullable<Json>,
      page_limit: pageLimit,
      ai_generation_id: generationId,
      idempotency_key: meta.idempotencyKey ? `${brand.id}:${meta.idempotencyKey}` : null,
      created_by: viewer.user.id,
    })
    .select('id')
    .single()
  if (inserted.error) {
    await failGeneration(generationId, reservationId, 'CRAWL_INSERT_FAILED', inserted.error.message)
    if (inserted.error.code === '23505') {
      throw new ApiError('CONFLICT', 'Analiza ovog sajta je već u toku. Sačekajte da se završi.')
    }
    throw mapDbError(inserted.error)
  }
  const crawlId = inserted.data.id

  try {
    await enqueueBrandAnalysis({
      brandId: brand.id,
      crawlId,
      workspaceId: brand.workspace_id,
      requestedBy: viewer.user.id,
      generationId,
    })
  } catch (error) {
    await markCrawlFailed(
      crawlId,
      'ENQUEUE_FAILED',
      error instanceof Error ? error.message : 'Red nije dostupan.',
    )
    throw error
  }

  logger.info('brand_analyze_requested', { brandId: brand.id, crawlId, pageLimit, price, firstAnalysis })
  return { crawlId, generationId, tokensCharged: price, status: 'queued', firstAnalysis }
}

export async function loadCrawl(crawlId: string): Promise<CrawlRow | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('website_crawls').select('*').eq('id', crawlId).maybeSingle()
  return data
}

export async function setCrawlProgress(
  crawlId: string,
  patch: Partial<CrawlProgress> & { phase: CrawlPhase },
  extra: Partial<Pick<CrawlRow, 'pages_found' | 'pages_fetched' | 'robots_blocked' | 'status'>> = {},
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const base = CRAWL_PHASES[patch.phase]
  const progress: CrawlProgress = { ...base, ...patch }
  await admin
    .from('website_crawls')
    .update({ phase: patch.phase, progress: progress as unknown as NonNullable<Json>, ...extra })
    .eq('id', crawlId)
}

/** Označava analizu kao neuspelu i vraća rezervisane tokene. Idempotentno. */
export async function markCrawlFailed(crawlId: string, code: string, message: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const crawl = await loadCrawl(crawlId)
  if (!crawl) return
  if (crawl.status === 'failed' || crawl.status === 'canceled') return
  const progress: CrawlProgress = { phase: 'finish', message: 'Analiza nije uspela', percent: 100 }
  await admin
    .from('website_crawls')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message.slice(0, 1000),
      finished_at: new Date().toISOString(),
      progress: progress as unknown as NonNullable<Json>,
    })
    .eq('id', crawlId)
  if (crawl.ai_generation_id) await failGenerationRow(crawl.ai_generation_id, code, message)
}

async function failGenerationRow(generationId: string, code: string, message: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: gen } = await admin
    .from('ai_generations')
    .select('id, status, token_reservation_id')
    .eq('id', generationId)
    .maybeSingle()
  if (!gen || gen.status === 'failed' || gen.status === 'succeeded' || gen.status === 'canceled') return
  await failGeneration(generationId, gen.token_reservation_id, code, message)
}

export interface CrawlPageSummary {
  id: string
  url: string
  type: Database['public']['Enums']['page_type']
  title: string | null
  wordCount: number | null
}

export interface CrawlView {
  id: string
  brandId: string
  url: string
  status: CrawlStatus
  phase: string | null
  progress: CrawlProgress | null
  pageLimit: number
  pagesFound: number
  pagesFetched: number
  robotsBlocked: boolean
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  profileVersion: number | null
  pages: CrawlPageSummary[]
}

export async function getCrawlView(viewer: Viewer, brandId: string, crawlId: string): Promise<CrawlView> {
  await getBrand(viewer, brandId)
  const row = unwrap(
    await viewer.supabase
      .from('website_crawls')
      .select('*')
      .eq('id', crawlId)
      .eq('brand_id', brandId)
      .maybeSingle(),
    'Analiza ne postoji ili nemate pristup.',
  )
  const [pagesRes, profileRes] = await Promise.all([
    viewer.supabase
      .from('website_pages')
      .select('id, url, page_type, title, word_count')
      .eq('crawl_id', crawlId)
      .order('fetched_at', { ascending: true })
      .limit(150),
    viewer.supabase.from('brand_profiles').select('version').eq('crawl_id', crawlId).maybeSingle(),
  ])
  return toCrawlView(row, pagesRes.data ?? [], profileRes.data?.version ?? null)
}

export async function listCrawls(viewer: Viewer, brandId: string, limit = 10): Promise<CrawlView[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('website_crawls')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw mapDbError(error)
  return (data ?? []).map((row) => toCrawlView(row, [], null))
}

function toCrawlView(
  row: CrawlRow,
  pages: Array<{
    id: string
    url: string
    page_type: CrawlPageSummary['type']
    title: string | null
    word_count: number | null
  }>,
  profileVersion: number | null,
): CrawlView {
  return {
    id: row.id,
    brandId: row.brand_id,
    url: row.url,
    status: row.status,
    phase: row.phase,
    progress: (row.progress as unknown as CrawlProgress | null) ?? null,
    pageLimit: row.page_limit,
    pagesFound: row.pages_found,
    pagesFetched: row.pages_fetched,
    robotsBlocked: row.robots_blocked,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    profileVersion,
    pages: pages.map((p) => ({
      id: p.id,
      url: p.url,
      type: p.page_type,
      title: p.title,
      wordCount: p.word_count,
    })),
  }
}

/** Otkazivanje analize u toku: status canceled, tokeni vraćeni, Inngest run prekinut. */
export async function cancelAnalysis(viewer: Viewer, brandId: string, crawlId: string): Promise<CrawlView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const crawl = await loadCrawl(crawlId)
  if (!crawl || crawl.brand_id !== brandId) throw new ApiError('NOT_FOUND', 'Analiza ne postoji.')
  if (crawl.status !== 'queued' && crawl.status !== 'running') {
    throw new ApiError('CONFLICT', 'Analiza je već završena.')
  }
  const admin = createSupabaseAdminClient()
  const progress: CrawlProgress = { phase: 'finish', message: 'Otkazano', percent: 100 }
  await admin
    .from('website_crawls')
    .update({
      status: 'canceled',
      finished_at: new Date().toISOString(),
      progress: progress as unknown as NonNullable<Json>,
    })
    .eq('id', crawlId)
  if (crawl.ai_generation_id) {
    const { data: gen } = await admin
      .from('ai_generations')
      .select('token_reservation_id, status')
      .eq('id', crawl.ai_generation_id)
      .maybeSingle()
    if (gen && (gen.status === 'queued' || gen.status === 'running')) {
      if (gen.token_reservation_id) await releaseReservation(gen.token_reservation_id, 'CANCELED')
      await admin
        .from('ai_generations')
        .update({ status: 'canceled', finished_at: new Date().toISOString() })
        .eq('id', crawl.ai_generation_id)
    }
  }
  await sendBrandAnalysisCanceled(crawlId)
  return getCrawlView(viewer, brandId, crawlId)
}
