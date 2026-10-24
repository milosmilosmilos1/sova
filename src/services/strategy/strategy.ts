import 'server-only'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildStrategyPrompt,
  buildStrategySystemPrompt,
  strategyJsonSchema,
  strategyOutputSchema,
  type StrategyOutput,
} from '@/lib/ai/prompts/strategy'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueStrategyJob } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type {
  GenerateCalendarInput,
  GenerateStrategyInput,
  UpdateStrategyInput,
} from '@/lib/schemas/strategy'
import {
  addDays,
  bestTimesFromHistory,
  draftBrief,
  engagementOf,
  mergeBestTimes,
  nextMonday,
  pillarColor,
  planCalendar,
  type BestTimes,
  type NetworkMix,
  type WeeklyTheme,
} from '@/lib/strategy/plan'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { getBrand } from '@/services/brands'
import { zonedToUtc } from '@/lib/zoned-time'
import { listCampaigns, listPillars, type CampaignView, type PillarView } from '@/services/strategy/pillars'
import type { Database, Json } from '@/types/database'

/**
 * Strategija sadržaja (brif 7, faza 10a): AI generiše ciljeve, mix mreža, stubove, nedeljne teme,
 * hashtag strategiju i kampanje za period od 2–12 nedelja (20 tokena, u pozadini). Najbolja vremena
 * dolaze iz uvezene istorije kad je ima (≥ 10 objava po mreži), inače su pretpostavke i to piše.
 * „Napravi kalendar” iz strategije pravi nacrte sa terminom, stubom i kampanjom bez tokena.
 */
type StrategyRow = Database['public']['Tables']['strategies']['Row']

export interface StrategyGoal {
  goal: string
  kpi: string
  target: string
}
export interface HashtagStrategy {
  core: string[]
  niche: string[]
  local: string[]
  avoid: string[]
}

export interface StrategyListItem {
  id: string
  brandId: string
  periodStart: string
  periodEnd: string
  weeks: number
  version: number
  status: StrategyRow['status']
  summary: string | null
  usesAssumptions: boolean
  createdAt: string
  approvedAt: string | null
}

export interface StrategyView extends StrategyListItem {
  goals: StrategyGoal[]
  networkMix: NetworkMix
  weeklyThemes: WeeklyTheme[]
  hashtagStrategy: HashtagStrategy
  bestTimes: BestTimes
  assumptions: string[]
  approvedBy: string | null
  updatedAt: string
  pillars: PillarView[]
  campaigns: CampaignView[]
  plannedPosts: number
}

function weeksOf(row: Pick<StrategyRow, 'period_start' | 'period_end'>): number {
  const ms =
    new Date(`${row.period_end}T00:00:00Z`).getTime() - new Date(`${row.period_start}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((ms / 86_400_000 + 1) / 7))
}

function toListItem(r: StrategyRow): StrategyListItem {
  return {
    id: r.id,
    brandId: r.brand_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    weeks: weeksOf(r),
    version: r.version,
    status: r.status,
    summary: r.summary,
    usesAssumptions: r.uses_assumptions,
    createdAt: r.created_at,
    approvedAt: r.approved_at,
  }
}

const EMPTY_HASHTAGS: HashtagStrategy = { core: [], niche: [], local: [], avoid: [] }

function asObject<T>(v: Json | null, fallback: T): T {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as T) : fallback
}
function asArray<T>(v: Json | null): T[] {
  return Array.isArray(v) ? (v as unknown as T[]) : []
}

async function toView(viewer: Viewer, r: StrategyRow): Promise<StrategyView> {
  const [pillars, campaigns, planned] = await Promise.all([
    listPillars(viewer, r.brand_id, true),
    listCampaigns(viewer, r.brand_id),
    viewer.supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('strategy_id', r.id)
      .is('deleted_at', null),
  ])
  return {
    ...toListItem(r),
    goals: asArray<StrategyGoal>(r.goals),
    networkMix: asObject<NetworkMix>(r.network_mix, {}),
    weeklyThemes: asArray<WeeklyTheme>(r.weekly_themes),
    hashtagStrategy: asObject<HashtagStrategy>(r.hashtag_strategy, EMPTY_HASHTAGS),
    bestTimes: asObject<BestTimes>(r.best_times, {}),
    assumptions: asArray<string>(r.assumptions),
    approvedBy: r.approved_by,
    updatedAt: r.updated_at,
    pillars: pillars.filter((p) => p.strategyId === r.id || p.isActive),
    campaigns: campaigns.filter((c) => c.strategyId === r.id || !c.strategyId),
    plannedPosts: planned.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Generisanje (202 → Inngest)
// ---------------------------------------------------------------------------

export interface StrategyJobAccepted {
  generationId: string
  status: 'queued'
  tokensReserved: number
  periodStart: string
  periodEnd: string
  platforms: SocialPlatform[]
}

interface StrategyJobInput {
  brandId: string
  periodStart: string
  periodEnd: string
  weeks: number
  platforms: SocialPlatform[]
  goals: string[]
  notes: string | null
  postsPerWeek: number | null
}

async function activePlatforms(brandId: string): Promise<SocialPlatform[]> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('social_accounts')
    .select('platform')
    .eq('brand_id', brandId)
    .eq('status', 'active')
  return [...new Set((data ?? []).map((a) => a.platform))]
}

export async function requestStrategy(
  viewer: Viewer,
  input: GenerateStrategyInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<StrategyJobAccepted> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)

  const periodStart = input.periodStart ?? nextMonday(new Date())
  const periodEnd = addDays(periodStart, input.weeks * 7 - 1)
  const platforms = input.platforms?.length ? input.platforms : await activePlatforms(brand.id)
  if (!platforms.length) {
    throw new ApiError(
      'VALIDATION',
      'Povežite bar jednu mrežu u Mrežama ili izaberite mreže za koje pravite strategiju.',
      { fields: { platforms: ['obavezno'] } },
    )
  }
  const price = await getTokenPrice('strategy')
  const job: StrategyJobInput = {
    brandId: brand.id,
    periodStart,
    periodEnd,
    weeks: input.weeks,
    platforms,
    goals: input.goals,
    notes: input.notes ?? null,
    postsPerWeek: input.postsPerWeek ?? null,
  }
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'strategy',
    tokens: price,
    input: job as unknown as Record<string, string | null>,
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
    status: 'queued',
  })
  try {
    await enqueueStrategyJob(generationId, brand.id, brand.workspace_id)
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
  return { generationId, status: 'queued', tokensReserved: price, periodStart, periodEnd, platforms }
}

function countriesFor(locale: string): string[] {
  return locale.startsWith('sr') ? ['RS', 'GLOBAL'] : ['GLOBAL']
}

async function holidaysBetween(locale: string, from: string, to: string) {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('holidays')
    .select('date, name, kind, country')
    .in('country', countriesFor(locale))
    .gte('date', from)
    .lte('date', to)
    .order('date')
  return data ?? []
}

async function performanceFor(brandId: string, timeZone: string) {
  const admin = createSupabaseAdminClient()
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString()
  const { data } = await admin
    .from('historical_posts')
    .select('social_account_id, text_content, published_at, metrics')
    .eq('brand_id', brandId)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(500)
  const rows = data ?? []
  const accountIds = [...new Set(rows.map((r) => r.social_account_id))]
  const platformByAccount = new Map<string, SocialPlatform>()
  if (accountIds.length) {
    const { data: accounts } = await admin.from('social_accounts').select('id, platform').in('id', accountIds)
    for (const a of accounts ?? []) platformByAccount.set(a.id, a.platform)
  }
  const points = rows
    .filter((r) => r.published_at && platformByAccount.has(r.social_account_id))
    .map((r) => ({
      platform: platformByAccount.get(r.social_account_id)!,
      publishedAt: r.published_at!,
      engagement: engagementOf(r.metrics as Record<string, unknown>),
      excerpt: (r.text_content ?? '').replace(/\s+/g, ' ').slice(0, 160),
    }))
  const perPlatform: Partial<Record<SocialPlatform, number>> = {}
  for (const p of points) perPlatform[p.platform] = (perPlatform[p.platform] ?? 0) + 1
  const perPlatformPerWeek: Partial<Record<SocialPlatform, number>> = {}
  for (const [k, n] of Object.entries(perPlatform))
    perPlatformPerWeek[k as SocialPlatform] = Math.round((n / 26) * 10) / 10
  const topPosts = [...points]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5)
    .map((p) => ({
      platform: p.platform,
      excerpt: p.excerpt,
      engagement: p.engagement,
      publishedAt: p.publishedAt,
    }))
  return {
    points,
    performance: { postsAnalyzed: points.length, topPosts, perPlatformPerWeek },
    dataTimes: bestTimesFromHistory(points, timeZone),
  }
}

/** Normalizacija AI izlaza: samo tražene mreže, udeli 100, tačno `weeks` tema, datumi kampanja u periodu. */
export function normalizeStrategyOutput(
  out: StrategyOutput,
  job: Pick<StrategyJobInput, 'platforms' | 'weeks' | 'periodStart' | 'periodEnd'>,
): StrategyOutput {
  const platforms = new Set(job.platforms)
  const mix = out.network_mix
    .filter((m) => platforms.has(m.platform))
    .map((m) => ({ ...m, per_week: Math.max(1, Math.min(7, Math.round(m.per_week))) }))
  for (const p of job.platforms) {
    if (!mix.some((m) => m.platform === p)) mix.push({ platform: p, per_week: 2, formats: [], role: '' })
  }
  let pillars = out.pillars.filter((p) => p.name.trim()).slice(0, 6)
  const total = pillars.reduce((s, p) => s + Math.max(0, p.share_percent), 0)
  if (pillars.length && total > 0) {
    pillars = pillars.map((p) => ({
      ...p,
      share_percent: Math.round((Math.max(0, p.share_percent) / total) * 100),
    }))
    const diff = 100 - pillars.reduce((s, p) => s + p.share_percent, 0)
    pillars[0]!.share_percent += diff
  }
  const themes: StrategyOutput['weekly_themes'] = []
  for (let w = 1; w <= job.weeks; w++) {
    const t =
      out.weekly_themes.find((x) => x.week === w) ??
      out.weekly_themes[w - 1] ??
      out.weekly_themes[out.weekly_themes.length - 1]
    themes.push(
      t
        ? { ...t, week: w }
        : { week: w, theme: `Nedelja ${w}`, angle: '', pillar: pillars[0]?.name ?? '', campaign: '' },
    )
  }
  const inPeriod = (d: string) =>
    d < job.periodStart ? job.periodStart : d > job.periodEnd ? job.periodEnd : d
  const campaigns = out.campaigns
    .filter(
      (c) =>
        c.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(c.starts_on) && /^\d{4}-\d{2}-\d{2}$/.test(c.ends_on),
    )
    .map((c) => ({ ...c, starts_on: inPeriod(c.starts_on), ends_on: inPeriod(c.ends_on) }))
    .filter((c) => c.ends_on >= c.starts_on)
    .slice(0, 5)
  const tag = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
  const tags = (list: string[]) => [
    ...new Set(
      list
        .map(tag)
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`)),
    ),
  ]
  return {
    ...out,
    network_mix: mix,
    pillars,
    weekly_themes: themes,
    campaigns,
    hashtag_strategy: {
      core: tags(out.hashtag_strategy.core),
      niche: tags(out.hashtag_strategy.niche),
      local: tags(out.hashtag_strategy.local),
      avoid: tags(out.hashtag_strategy.avoid),
    },
    best_times: out.best_times.filter((b) => platforms.has(b.platform)),
  }
}

export async function runStrategyGeneration(
  generationId: string,
): Promise<{ status: 'succeeded' | 'failed' | 'skipped'; strategyId?: string }> {
  const admin = createSupabaseAdminClient()
  const { data: gen } = await admin
    .from('ai_generations')
    .select('id, workspace_id, brand_id, user_id, status, input, token_reservation_id')
    .eq('id', generationId)
    .maybeSingle()
  if (!gen) {
    logger.error('strategy_job_missing', { generationId })
    return { status: 'skipped' }
  }
  if (gen.status !== 'queued' && gen.status !== 'running') return { status: 'skipped' }
  const job = gen.input as unknown as StrategyJobInput
  await admin
    .from('ai_generations')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      progress: { step: 'context', message: 'Skupljam podatke o brendu…' },
    })
    .eq('id', generationId)
  const started = Date.now()
  try {
    const brand = unwrap(
      await admin.from('brands').select('*').eq('id', job.brandId).maybeSingle(),
      'Brend ne postoji.',
    )
    const [context, holidays, perf, pillars] = await Promise.all([
      buildBrandContext(brand, 'strategija sadržaja: usluge, publika, ponuda, sezona', undefined),
      holidaysBetween(brand.content_locale, job.periodStart, job.periodEnd),
      performanceFor(brand.id, brand.timezone),
      admin.from('content_pillars').select('name').eq('brand_id', brand.id).eq('is_active', true),
    ])
    const prompt = buildStrategyPrompt({
      brand: context,
      periodStart: job.periodStart,
      periodEnd: job.periodEnd,
      weeks: job.weeks,
      platforms: job.platforms,
      userGoals: job.goals ?? [],
      notes: job.notes,
      postsPerWeekHint: job.postsPerWeek,
      existingPillars: (pillars.data ?? []).map((p) => p.name),
      holidays: holidays.map((h) => ({ date: h.date, name: h.name, kind: h.kind })),
      performance: perf.performance,
      platformsWithDataTimes: Object.keys(perf.dataTimes) as SocialPlatform[],
    })
    await admin
      .from('ai_generations')
      .update({ progress: { step: 'generating', message: 'Pišem strategiju…' } })
      .eq('id', generationId)
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildStrategySystemPrompt(),
          prompt,
          jsonSchema: strategyJsonSchema(),
          maxOutputTokens: 8192,
          temperature: 0.7,
          thinking: 'low',
        }),
      { label: 'strategy' },
    )
    const parsed = strategyOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi strategije.', {
        model: outcome.model,
      })
    }
    const out = normalizeStrategyOutput(parsed.data, job)
    const bestTimes = mergeBestTimes(job.platforms, perf.dataTimes, out.best_times)
    const usesAssumptions = Object.values(bestTimes).some((slots) =>
      slots?.some((s) => s.source === 'assumption'),
    )
    const networkMix: NetworkMix = {}
    for (const m of out.network_mix)
      networkMix[m.platform] = { per_week: m.per_week, formats: m.formats, role: m.role }

    const { data: prev } = await admin
      .from('strategies')
      .select('version')
      .eq('brand_id', brand.id)
      .eq('period_start', job.periodStart)
      .order('version', { ascending: false })
      .limit(1)
    const version = (prev?.[0]?.version ?? 0) + 1
    const strategy = unwrap(
      await admin
        .from('strategies')
        .insert({
          brand_id: brand.id,
          period_start: job.periodStart,
          period_end: job.periodEnd,
          version,
          status: 'draft',
          goals: out.goals as unknown as NonNullable<Json>,
          network_mix: networkMix as unknown as NonNullable<Json>,
          weekly_themes: out.weekly_themes as unknown as NonNullable<Json>,
          hashtag_strategy: out.hashtag_strategy as unknown as NonNullable<Json>,
          best_times: bestTimes as unknown as NonNullable<Json>,
          uses_assumptions: usesAssumptions || perf.performance.postsAnalyzed === 0,
          summary: out.summary,
          assumptions: out.assumptions as unknown as NonNullable<Json>,
          ai_generation_id: generationId,
          created_by: gen.user_id,
        })
        .select('*')
        .single(),
    )

    // stubovi: postojeći sa istim imenom se vezuju, novi se dodaju
    const { data: existingPillars } = await admin
      .from('content_pillars')
      .select('id, name, strategy_id, sort_order')
      .eq('brand_id', brand.id)
    const byName = new Map((existingPillars ?? []).map((p) => [p.name.trim().toLowerCase(), p]))
    let order = existingPillars?.length ?? 0
    for (const [i, p] of out.pillars.entries()) {
      const hit = byName.get(p.name.trim().toLowerCase())
      if (hit) {
        await admin
          .from('content_pillars')
          .update({ strategy_id: strategy.id, share_percent: p.share_percent, is_active: true })
          .eq('id', hit.id)
      } else {
        await admin.from('content_pillars').insert({
          brand_id: brand.id,
          strategy_id: strategy.id,
          name: p.name.trim().slice(0, 100),
          description: p.description || null,
          share_percent: p.share_percent,
          color: pillarColor(order + i),
          sort_order: order + i,
        })
      }
    }
    order += out.pillars.length
    for (const c of out.campaigns) {
      await admin.from('campaigns').insert({
        brand_id: brand.id,
        strategy_id: strategy.id,
        name: c.name.trim().slice(0, 150),
        goal: c.goal || null,
        starts_on: c.starts_on,
        ends_on: c.ends_on,
        key_message: c.key_message || null,
        offer: c.offer || null,
        cta: c.cta || null,
      })
    }

    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: {
          strategyId: strategy.id,
          version,
          summary: out.summary,
          usesAssumptions: strategy.uses_assumptions,
        },
        duration_ms: Date.now() - started,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
        progress: null,
      })
      .eq('id', generationId)
    if (gen.token_reservation_id) await confirmReservation(gen.token_reservation_id)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    logger.info('strategy_generated', {
      generationId,
      strategyId: strategy.id,
      version,
      model: outcome.model,
    })
    return { status: 'succeeded', strategyId: strategy.id }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, gen.token_reservation_id, api.code, api.message, {
      duration_ms: Date.now() - started,
    })
    logger.warn('strategy_job_failed', { generationId, code: api.code, message: api.message })
    return { status: 'failed' }
  }
}

// ---------------------------------------------------------------------------
// Čitanje i izmene
// ---------------------------------------------------------------------------

export async function listStrategies(viewer: Viewer, brandId: string): Promise<StrategyListItem[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('strategies')
    .select('*')
    .eq('brand_id', brandId)
    .order('period_start', { ascending: false })
    .order('version', { ascending: false })
  if (error) throw mapDbError(error)
  return (data ?? []).map(toListItem)
}

async function loadStrategy(viewer: Viewer, id: string): Promise<StrategyRow> {
  return unwrap(
    await viewer.supabase.from('strategies').select('*').eq('id', id).maybeSingle(),
    'Strategija ne postoji ili nemate pristup.',
  )
}

export async function getStrategy(viewer: Viewer, id: string): Promise<StrategyView> {
  return toView(viewer, await loadStrategy(viewer, id))
}

export async function updateStrategy(
  viewer: Viewer,
  id: string,
  patch: UpdateStrategyInput,
): Promise<StrategyView> {
  const row = await loadStrategy(viewer, id)
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const update: Database['public']['Tables']['strategies']['Update'] = {}
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.goals) update.goals = patch.goals as unknown as NonNullable<Json>
  if (patch.networkMix) update.network_mix = patch.networkMix as unknown as NonNullable<Json>
  if (patch.weeklyThemes) update.weekly_themes = patch.weeklyThemes as unknown as NonNullable<Json>
  if (patch.hashtagStrategy) update.hashtag_strategy = patch.hashtagStrategy as unknown as NonNullable<Json>
  if (patch.bestTimes) {
    update.best_times = patch.bestTimes as unknown as NonNullable<Json>
    update.uses_assumptions = Object.values(patch.bestTimes).some((s) =>
      s?.some((x) => x.source === 'assumption'),
    )
  }
  if (patch.status && patch.status !== row.status) {
    update.status = patch.status
    if (patch.status === 'active') {
      const { error } = await admin
        .from('strategies')
        .update({ status: 'archived' })
        .eq('brand_id', row.brand_id)
        .eq('status', 'active')
        .neq('id', id)
        .lte('period_start', row.period_end)
        .gte('period_end', row.period_start)
      if (error) throw mapDbError(error)
      update.approved_by = viewer.user.id
      update.approved_at = new Date().toISOString()
    }
  }
  const updated = unwrap(await admin.from('strategies').update(update).eq('id', id).select('*').single())
  logger.info('strategy_updated', { strategyId: id, by: viewer.user.id, fields: Object.keys(update) })
  return toView(viewer, updated)
}

export interface CalendarGenerationResult {
  created: number
  skipped: { past: number; duplicate: number; noAccount: number }
  from: string
  to: string
  postIds: string[]
}

/**
 * Nacrti iz strategije: po nedelji i mreži `per_week` objava u najboljim terminima (zona brenda),
 * sa temom, stubom i kampanjom; isti termin za istu mrežu se ne duplira, prošli termini se preskaču.
 */
export async function generateCalendar(
  viewer: Viewer,
  strategyId: string,
  input: GenerateCalendarInput,
): Promise<CalendarGenerationResult> {
  const row = await loadStrategy(viewer, strategyId)
  if (row.status === 'archived') throw new ApiError('CONFLICT', 'Arhivirana strategija ne pravi kalendar.')
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const view = await toView(viewer, row)
  const platforms = Object.keys(view.networkMix) as SocialPlatform[]
  const { data: accounts } = await admin
    .from('social_accounts')
    .select('id, platform')
    .eq('brand_id', brand.id)
    .eq('status', 'active')
    .in('platform', platforms.length ? platforms : ['facebook'])
  const accountsByPlatform = new Map<SocialPlatform, string[]>()
  for (const a of accounts ?? [])
    accountsByPlatform.set(a.platform, [...(accountsByPlatform.get(a.platform) ?? []), a.id])

  const holidays = new Set(
    (await holidaysBetween(brand.content_locale, row.period_start, row.period_end))
      .filter((h) => h.kind === 'public')
      .map((h) => h.date),
  )
  const { data: existing } = await admin
    .from('posts')
    .select('id, scheduled_for, post_targets(platform)')
    .eq('strategy_id', strategyId)
    .is('deleted_at', null)
  const taken = new Set<string>()
  for (const p of existing ?? []) {
    const minute = p.scheduled_for ? new Date(p.scheduled_for).toISOString().slice(0, 16) : ''
    for (const t of (p.post_targets as Array<{ platform: SocialPlatform }> | null) ?? [])
      taken.add(`${t.platform}|${minute}`)
  }
  const pillarByName = new Map(view.pillars.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const campaignByName = new Map(view.campaigns.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const weeksFilter = input.weeks?.length ? new Set(input.weeks) : null
  const plan = planCalendar({
    periodStart: row.period_start,
    weeks: view.weeks,
    networkMix: view.networkMix,
    bestTimes: view.bestTimes,
    weeklyThemes: view.weeklyThemes,
    holidays,
  }).filter((p) => !weeksFilter || weeksFilter.has(p.week))

  const result: CalendarGenerationResult = {
    created: 0,
    skipped: { past: 0, duplicate: 0, noAccount: 0 },
    from: row.period_start,
    to: row.period_end,
    postIds: [],
  }
  const nowPlus = Date.now() + 60_000
  for (const p of plan) {
    const accountIds = accountsByPlatform.get(p.platform) ?? []
    if (!accountIds.length) {
      result.skipped.noAccount += 1
      continue
    }
    const utc = zonedToUtc(p.date, p.timeLocal, brand.timezone)
    if (new Date(utc).getTime() < nowPlus) {
      result.skipped.past += 1
      continue
    }
    const key = `${p.platform}|${utc.slice(0, 16)}`
    if (taken.has(key)) {
      result.skipped.duplicate += 1
      continue
    }
    const { data: post, error } = await admin
      .from('posts')
      .insert({
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        title: `${p.theme}${p.angle ? ` — ${p.angle}` : ''}`.slice(0, 200),
        master_text: draftBrief(p),
        status: 'draft',
        source: 'ai',
        pillar_id: pillarByName.get(p.pillar.trim().toLowerCase()) ?? null,
        campaign_id: p.campaign ? (campaignByName.get(p.campaign.trim().toLowerCase()) ?? null) : null,
        strategy_id: strategyId,
        scheduled_for: utc,
        created_by: viewer.user.id,
      })
      .select('id')
      .single()
    if (error || !post) throw mapDbError(error)
    const { error: tErr } = await admin.from('post_targets').insert(
      accountIds.map((social_account_id) => ({
        post_id: post.id,
        brand_id: brand.id,
        social_account_id,
        platform: p.platform,
        text_content: '',
      })),
    )
    if (tErr) throw mapDbError(tErr)
    taken.add(key)
    result.created += 1
    result.postIds.push(post.id)
  }
  logger.info('strategy_calendar_generated', {
    strategyId,
    by: viewer.user.id,
    ...result,
    postIds: undefined,
  })
  return result
}

/** Aktivna strategija brenda (za Autopilot i početnu stranu). */
export async function activeStrategy(viewer: Viewer, brandId: string): Promise<StrategyListItem | null> {
  const list = await listStrategies(viewer, brandId)
  return list.find((s) => s.status === 'active') ?? null
}

export { PLATFORMS }
