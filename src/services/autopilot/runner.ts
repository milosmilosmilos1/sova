import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import type { PostGoal } from '@/lib/ai/prompts/post-text'
import {
  MAX_WEEKLY_DRAFTS,
  MEDIA_REQUIRED,
  canSpend,
  firstMondayNextMonth,
  nextWeekRange,
  qaCheck,
  type AutopilotLevel,
  type QaReport,
} from '@/lib/autopilot/rules'
import { isFeatureEnabled } from '@/lib/flags'
import { logger } from '@/lib/logger'
import {
  addDays,
  draftBrief,
  planCalendar,
  type BestTimes,
  type NetworkMix,
  type WeeklyTheme,
} from '@/lib/strategy/plan'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getTokenPrice } from '@/lib/tokens/prices'
import { startGeneration } from '@/services/ai/generations'
import { computeOverview } from '@/services/analytics/overview'
import {
  brandContextFor,
  generateDraftText,
  generateTemplateVisual,
  headlineFrom,
} from '@/services/autopilot/content'
import { autopilotSettings, autopilotUsage } from '@/services/autopilot/settings'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import { zonedToUtc } from '@/services/posts/calendar'
import { systemSchedule, systemSubmitForReview } from '@/services/posts/system'
import { runStrategyGeneration } from '@/services/strategy/strategy'
import type { Database, Json } from '@/types/database'

/**
 * Autopilot ciklus (brif 9.3): nedeljni prolaz pravi nacrte za narednu nedelju iz aktivne strategije
 * (nivo ≥ 1), puni ih tekstom i vizualom u okviru mesečnog budžeta, propušta kroz kontrolu kvaliteta
 * i šalje na odobrenje ili (nivo 3, izabrani nalozi) zakazuje; mesečni prolaz pravi strategiju za
 * sledeći mesec (nivo ≥ 2) ili predlog u Inbox (nivo 1). Svaki korak je zaseban Inngest step.
 */
export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>
type BrandRow = Database['public']['Tables']['brands']['Row']
type StrategyRow = Database['public']['Tables']['strategies']['Row']

export interface WeeklyJob {
  brandId: string
  weekStart?: string | null
  triggeredBy?: string | null
}

export type DraftOutcome = 'submitted' | 'scheduled' | 'returned' | 'budget' | 'skipped' | 'error'

export interface DraftResult {
  postId: string
  outcome: DraftOutcome
  tokens: number
  message?: string
}

export interface WeeklySummary {
  status: 'succeeded' | 'partial' | 'skipped' | 'failed'
  runId: string | null
  reason?: string
  weekStart?: string
  planned: number
  submitted: number
  scheduled: number
  returned: number
  budgetStopped: boolean
  errors: number
  tokens: number
}

const EMPTY: Omit<WeeklySummary, 'status' | 'runId'> = {
  planned: 0,
  submitted: 0,
  scheduled: 0,
  returned: 0,
  budgetStopped: false,
  errors: 0,
  tokens: 0,
}

function countriesFor(locale: string): string[] {
  return locale.startsWith('sr') ? ['RS', 'GLOBAL'] : ['GLOBAL']
}

async function loadBrand(brandId: string): Promise<BrandRow | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('brands').select('*').eq('id', brandId).maybeSingle()
  return data
}

async function notifyRoles(
  brand: BrandRow,
  roles: Array<'owner' | 'admin' | 'editor' | 'approver'>,
  input: Omit<Parameters<typeof notifyUsers>[0], 'userIds' | 'workspaceId' | 'brandId'>,
): Promise<void> {
  const ids = await usersWithRoles(brand.workspace_id, brand.id, roles)
  await notifyUsers({ ...input, userIds: ids, workspaceId: brand.workspace_id, brandId: brand.id })
}

async function notifiedThisMonth(brandId: string, type: string, month: string): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('type', type)
    .contains('data', { month })
  return (count ?? 0) > 0
}

async function budgetNotice(brand: BrandRow): Promise<void> {
  const usage = await autopilotUsage(brand.id, brand.autopilot_token_budget)
  if (usage.state !== 'warning' && usage.state !== 'stopped') return
  const type = usage.state === 'stopped' ? 'autopilot_budget_stopped' : 'autopilot_budget_warning'
  if (await notifiedThisMonth(brand.id, type, usage.month)) return
  await notifyRoles(brand, ['owner', 'admin'], {
    type,
    title:
      usage.state === 'stopped'
        ? `Autopilot je stao: mesečni budžet je potrošen (${brand.name})`
        : `Autopilot je potrošio ${usage.percent} % mesečnog budžeta (${brand.name})`,
    body: `Potrošeno ${usage.used} od ${usage.budget} tokena u ${usage.month}. Budžet menjate na strani Autopilot.`,
    link: '/app/autopilot',
    data: { month: usage.month, used: usage.used, budget: usage.budget ?? 0 },
  })
}

// ---------------------------------------------------------------------------
// Strategija bez korisnika
// ---------------------------------------------------------------------------

async function activePlatforms(brandId: string): Promise<SocialPlatform[]> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('social_accounts')
    .select('platform')
    .eq('brand_id', brandId)
    .eq('status', 'active')
  return [...new Set((data ?? []).map((a) => a.platform))]
}

/** Aktivira strategiju i arhivira samo aktivne strategije čiji se period preklapa (D-064). */
export async function activateStrategySystem(strategyId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: s } = await admin.from('strategies').select('*').eq('id', strategyId).maybeSingle()
  if (!s) return
  await admin
    .from('strategies')
    .update({ status: 'archived' })
    .eq('brand_id', s.brand_id)
    .eq('status', 'active')
    .neq('id', strategyId)
    .lte('period_start', s.period_end)
    .gte('period_end', s.period_start)
  await admin
    .from('strategies')
    .update({ status: 'active', approved_at: new Date().toISOString(), approved_by: null })
    .eq('id', strategyId)
}

export async function generateAutopilotStrategy(
  brand: BrandRow,
  periodStart: string,
  weeks: number,
  runId: string,
): Promise<{ strategyId: string | null; tokens: number; reason?: string }> {
  const platforms = await activePlatforms(brand.id)
  if (!platforms.length) return { strategyId: null, tokens: 0, reason: 'Brend nema aktivnih naloga.' }
  const price = await getTokenPrice('strategy')
  const usage = await autopilotUsage(brand.id, brand.autopilot_token_budget)
  if (!canSpend(usage.used, usage.budget, price)) return { strategyId: null, tokens: 0, reason: 'budget' }
  const periodEnd = addDays(periodStart, weeks * 7 - 1)
  const { generationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: null,
    type: 'strategy',
    tokens: price,
    input: {
      autopilot: true,
      runId,
      brandId: brand.id,
      periodStart,
      periodEnd,
      weeks,
      platforms,
      goals: [],
      notes: 'Autopilot: strategija za naredni period na osnovu dosadašnjih rezultata i profila brenda.',
      postsPerWeek: null,
    },
    status: 'queued',
  })
  const r = await runStrategyGeneration(generationId)
  if (r.status !== 'succeeded' || !r.strategyId)
    return { strategyId: null, tokens: 0, reason: 'Generisanje strategije nije uspelo.' }
  await activateStrategySystem(r.strategyId)
  return { strategyId: r.strategyId, tokens: price }
}

async function strategyCovering(
  brandId: string,
  date: string,
  statuses: StrategyRow['status'][] = ['active'],
) {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('strategies')
    .select('*')
    .eq('brand_id', brandId)
    .in('status', statuses)
    .lte('period_start', date)
    .gte('period_end', date)
    .order('version', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

async function suggestStrategy(brand: BrandRow, periodStart: string, reason: string): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .eq('kind', 'strategy_proposal')
    .eq('status', 'new')
    .contains('payload', { periodStart })
  if (count) return false
  await admin.from('suggestions').insert({
    brand_id: brand.id,
    source: 'analytics',
    kind: 'strategy_proposal',
    title: `Strategija za period od ${periodStart}`,
    body: `${reason} Napravite strategiju (20 tokena) da Autopilot može da pripremi nacrte.`,
    payload: { periodStart } as unknown as NonNullable<Json>,
    score: 80,
    expires_at: new Date(new Date(`${periodStart}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString(),
  })
  return true
}

// ---------------------------------------------------------------------------
// Nedeljni prolaz
// ---------------------------------------------------------------------------

type Prepared =
  | { status: 'skipped'; runId: string | null; reason: string }
  | { status: 'needs_strategy'; runId: string; weekStart: string; level: AutopilotLevel }
  | { status: 'ready'; runId: string; weekStart: string; strategyId: string; level: AutopilotLevel }

async function finishRun(
  runId: string,
  status: WeeklySummary['status'],
  summary: Record<string, unknown>,
  tokens = 0,
) {
  const admin = createSupabaseAdminClient()
  await admin
    .from('autopilot_runs')
    .update({
      status,
      summary: summary as unknown as NonNullable<Json>,
      tokens_used: tokens,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

async function prepareWeek(job: WeeklyJob, now: Date): Promise<Prepared> {
  const brand = await loadBrand(job.brandId)
  if (!brand || brand.deleted_at) return { status: 'skipped', runId: null, reason: 'Brend ne postoji.' }
  if (brand.status !== 'active') return { status: 'skipped', runId: null, reason: 'Brend je pauziran.' }
  const level = brand.autopilot_level as AutopilotLevel
  if (level < 1) return { status: 'skipped', runId: null, reason: 'Autopilot je isključen (nivo 0).' }
  const weekStart = job.weekStart ?? nextWeekRange(now, brand.timezone).start
  const admin = createSupabaseAdminClient()
  const { data: run, error } = await admin
    .from('autopilot_runs')
    .insert({
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      kind: 'weekly',
      period_start: weekStart,
      level,
      triggered_by: job.triggeredBy ?? null,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505')
      return { status: 'skipped', runId: null, reason: `Prolaz za nedelju ${weekStart} je već urađen.` }
    throw error
  }
  const strategy = await strategyCovering(brand.id, weekStart)
  if (strategy) return { status: 'ready', runId: run.id, weekStart, strategyId: strategy.id, level }
  if (level >= 2) return { status: 'needs_strategy', runId: run.id, weekStart, level }
  await suggestStrategy(brand, weekStart, 'Nema aktivne strategije za sledeću nedelju.')
  await notifyRoles(brand, ['owner', 'admin', 'editor'], {
    type: 'autopilot_strategy',
    title: 'Autopilot čeka strategiju',
    body: `Za nedelju od ${weekStart} nema aktivne strategije, pa Sova nije pripremila nacrte. Predlog je u Inbox-u.`,
    link: '/app/strategy',
    data: { weekStart },
  })
  await finishRun(run.id, 'skipped', { reason: 'Nema aktivne strategije.' })
  return { status: 'skipped', runId: run.id, reason: 'Nema aktivne strategije.' }
}

function weeksOf(row: Pick<StrategyRow, 'period_start' | 'period_end'>): number {
  const ms =
    new Date(`${row.period_end}T00:00:00Z`).getTime() - new Date(`${row.period_start}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((ms / 86_400_000 + 1) / 7))
}

/** Nacrti nedelje iz strategije: postojeći nacrti-brifovi se pune, nedostajući termini se prave. */
async function planWeek(runId: string, strategyId: string, weekStart: string): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const { data: s } = await admin.from('strategies').select('*').eq('id', strategyId).maybeSingle()
  if (!s) return []
  const brand = (await loadBrand(s.brand_id))!
  const weekIndex =
    Math.floor(
      (new Date(`${weekStart}T00:00:00Z`).getTime() - new Date(`${s.period_start}T00:00:00Z`).getTime()) /
        (7 * 86_400_000),
    ) + 1
  const weekEnd = addDays(weekStart, 6)
  const { data: holidays } = await admin
    .from('holidays')
    .select('date, kind')
    .in('country', countriesFor(brand.content_locale))
    .eq('kind', 'public')
    .gte('date', s.period_start)
    .lte('date', s.period_end)
  const networkMix = (s.network_mix ?? {}) as unknown as NetworkMix
  const plan = planCalendar({
    periodStart: s.period_start,
    weeks: weeksOf(s),
    networkMix,
    bestTimes: (s.best_times ?? {}) as unknown as BestTimes,
    weeklyThemes: (Array.isArray(s.weekly_themes) ? s.weekly_themes : []) as unknown as WeeklyTheme[],
    holidays: new Set((holidays ?? []).map((h) => h.date)),
  }).filter((p) => p.week === weekIndex && p.date >= weekStart && p.date <= weekEnd)

  const platforms = [...new Set(plan.map((p) => p.platform))]
  const { data: accounts } = await admin
    .from('social_accounts')
    .select('id, platform')
    .eq('brand_id', brand.id)
    .eq('status', 'active')
    .in('platform', platforms.length ? platforms : ['facebook'])
  const accountsByPlatform = new Map<SocialPlatform, string[]>()
  for (const a of accounts ?? [])
    accountsByPlatform.set(a.platform, [...(accountsByPlatform.get(a.platform) ?? []), a.id])

  const fromIso = zonedToUtc(weekStart, '00:00', brand.timezone)
  const toIso = zonedToUtc(addDays(weekStart, 7), '00:00', brand.timezone)
  const { data: existing } = await admin
    .from('posts')
    .select('id, status, source, master_text, scheduled_for, qa_report, post_targets(platform)')
    .eq('strategy_id', strategyId)
    .is('deleted_at', null)
    .gte('scheduled_for', fromIso)
    .lt('scheduled_for', toIso)
  const byKey = new Map<string, { id: string; fill: boolean }>()
  for (const p of existing ?? []) {
    const minute = p.scheduled_for ? new Date(p.scheduled_for).toISOString().slice(0, 16) : ''
    const fill = p.status === 'draft' && p.qa_report === null && p.master_text.startsWith('Tema nedelje')
    for (const t of (p.post_targets as Array<{ platform: SocialPlatform }> | null) ?? [])
      byKey.set(`${t.platform}|${minute}`, { id: p.id, fill })
  }
  const { data: pillars } = await admin.from('content_pillars').select('id, name').eq('brand_id', brand.id)
  const { data: campaigns } = await admin.from('campaigns').select('id, name').eq('brand_id', brand.id)
  const pillarByName = new Map((pillars ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]))
  const campaignByName = new Map((campaigns ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]))

  const ids: string[] = []
  for (const p of plan) {
    if (ids.length >= MAX_WEEKLY_DRAFTS) break
    const utc = zonedToUtc(p.date, p.timeLocal, brand.timezone)
    if (new Date(utc).getTime() < Date.now() + 3600_000) continue
    const hit = byKey.get(`${p.platform}|${utc.slice(0, 16)}`)
    if (hit) {
      if (hit.fill && !ids.includes(hit.id)) ids.push(hit.id)
      continue
    }
    const accountIds = accountsByPlatform.get(p.platform) ?? []
    if (!accountIds.length) continue
    const { data: post, error } = await admin
      .from('posts')
      .insert({
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        title: `${p.theme}${p.angle ? ` — ${p.angle}` : ''}`.slice(0, 200),
        master_text: draftBrief(p),
        status: 'draft',
        source: 'autopilot',
        pillar_id: pillarByName.get(p.pillar.trim().toLowerCase()) ?? null,
        campaign_id: p.campaign ? (campaignByName.get(p.campaign.trim().toLowerCase()) ?? null) : null,
        strategy_id: strategyId,
        scheduled_for: utc,
      })
      .select('id')
      .single()
    if (error || !post) {
      logger.warn('autopilot_plan_insert_failed', { runId, error: error?.message })
      continue
    }
    await admin.from('post_targets').insert(
      accountIds.map((social_account_id) => ({
        post_id: post.id,
        brand_id: brand.id,
        social_account_id,
        platform: p.platform,
        text_content: '',
      })),
    )
    ids.push(post.id)
  }
  await admin
    .from('autopilot_runs')
    .update({ summary: { strategyId, weekIndex, planned: ids.length } as unknown as NonNullable<Json> })
    .eq('id', runId)
  return ids
}

async function recentTexts(brandId: string, excludePostId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [{ data: posts }, { data: history }] = await Promise.all([
    admin
      .from('posts')
      .select('id, master_text, status')
      .eq('brand_id', brandId)
      .neq('id', excludePostId)
      .gte('created_at', since)
      .is('deleted_at', null)
      .in('status', ['in_review', 'approved', 'scheduled', 'publishing', 'published', 'partially_published'])
      .limit(200),
    admin
      .from('historical_posts')
      .select('text_content')
      .eq('brand_id', brandId)
      .gte('published_at', since)
      .limit(100),
  ])
  return [
    ...(posts ?? []).map((p) => p.master_text),
    ...(history ?? []).map((h) => h.text_content ?? ''),
  ].filter((t) => t && !t.startsWith('Tema nedelje'))
}

async function draftOne(runId: string, postId: string): Promise<DraftResult> {
  const admin = createSupabaseAdminClient()
  const { data: run } = await admin
    .from('autopilot_runs')
    .select('brand_id, level')
    .eq('id', runId)
    .maybeSingle()
  const { data: post } = await admin.from('posts').select('*').eq('id', postId).maybeSingle()
  if (!run || !post) return { postId, outcome: 'skipped', tokens: 0, message: 'objava ne postoji' }
  if (post.status !== 'draft' || post.qa_report !== null)
    return { postId, outcome: 'skipped', tokens: 0, message: `objava je ${post.status}` }
  const brand = (await loadBrand(run.brand_id))!
  if (brand.status !== 'active')
    return { postId, outcome: 'skipped', tokens: 0, message: 'brend je pauziran' }
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, platform, social_account_id')
    .eq('post_id', postId)
  const platform = targets?.[0]?.platform
  if (!platform) return { postId, outcome: 'skipped', tokens: 0, message: 'objava nema mrežu' }
  const needsMedia = MEDIA_REQUIRED.includes(platform)
  const textPrice = await getTokenPrice('text')
  const visualPrice = needsMedia ? await getTokenPrice('visual_template') : 0
  const usage = await autopilotUsage(brand.id, brand.autopilot_token_budget)
  if (!canSpend(usage.used, usage.budget, textPrice + visualPrice)) {
    return { postId, outcome: 'budget', tokens: 0, message: 'mesečni budžet je potrošen' }
  }

  let tokens = 0
  try {
    let campaign: {
      key_message: string | null
      offer: string | null
      cta: string | null
      name: string
    } | null = null
    if (post.campaign_id) {
      const { data } = await admin
        .from('campaigns')
        .select('name, key_message, offer, cta')
        .eq('id', post.campaign_id)
        .maybeSingle()
      campaign = data
    }
    const topic = [
      post.master_text.replace(/\n*Nacrt iz strategije:[\s\S]*$/, ''),
      campaign?.key_message ? `Poruka kampanje: ${campaign.key_message}` : null,
      campaign?.offer ? `Ponuda: ${campaign.offer}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const goal: PostGoal = campaign ? 'sales' : 'engagement'
    const context = await brandContextFor(brand, topic)
    const text = await generateDraftText(brand, context, {
      platform,
      topic,
      goal,
      cta: campaign?.cta ?? null,
      postId,
      runId,
    })
    tokens += text.tokens
    let hasMedia = false
    if (needsMedia) {
      const visual = await generateTemplateVisual(brand, {
        headline: headlineFrom(text.body, post.title ?? brand.name),
        subtext: null,
        cta: campaign?.cta ?? null,
        postId,
        runId,
      })
      if (visual) {
        tokens += visual.tokens
        hasMedia = true
        await admin
          .from('post_media')
          .insert({ post_id: postId, media_asset_id: visual.assetId, sort_order: 0 })
      }
    }
    const corpus = [
      ...(context.facts ?? []),
      ...(context.services ?? []),
      ...(context.knowledge ?? []),
      context.description ?? '',
      topic,
      campaign?.offer ?? '',
    ].join('\n')
    const report: QaReport = qaCheck({
      platform,
      text: text.body,
      hashtags: text.hashtags,
      locale: context.locale,
      forbiddenWords: context.forbiddenWords ?? [],
      factsCorpus: corpus,
      recentTexts: await recentTexts(brand.id, postId),
      hasMedia,
    })
    const { error: upErr } = await admin
      .from('posts')
      .update({
        master_text: text.text,
        first_comment: text.firstComment,
        source: 'autopilot',
        qa_report: report as unknown as NonNullable<Json>,
        version: post.version + 1,
      })
      .eq('id', postId)
      .eq('version', post.version)
    if (upErr) throw upErr
    if (!report.passed) {
      const failed = report.checks.filter((c) => !c.ok).map((c) => c.message)
      await notifyRoles(brand, ['owner', 'admin', 'editor'], {
        type: 'autopilot_returned',
        title: 'Autopilot je vratio objavu na doradu',
        body: `${post.title ?? 'Objava'}: ${failed.join(' ')}`.slice(0, 500),
        link: `/app/posts/${postId}`,
        data: { postId, runId },
        email: false,
      })
      return { postId, outcome: 'returned', tokens, message: failed.join(' ') }
    }
    const settings = autopilotSettings(brand)
    const level3 =
      brand.autopilot_level === 3 &&
      brand.autopilot_level3_confirmed_at !== null &&
      (await isFeatureEnabled('autopilot_level3')) &&
      (targets ?? []).every((t) => (settings.level3AccountIds ?? []).includes(t.social_account_id))
    if (level3) {
      await systemSchedule(postId, 'Autopilot (nivo 3): zakazano posle kontrole kvaliteta')
      return { postId, outcome: 'scheduled', tokens }
    }
    await systemSubmitForReview(postId, 'Autopilot: nacrt poslat na odobrenje')
    return { postId, outcome: 'submitted', tokens }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('autopilot_draft_failed', { runId, postId, message })
    return { postId, outcome: 'error', tokens, message }
  }
}

async function finishWeek(runId: string, weekStart: string, results: DraftResult[]): Promise<WeeklySummary> {
  const admin = createSupabaseAdminClient()
  const { data: run } = await admin
    .from('autopilot_runs')
    .select('brand_id, summary')
    .eq('id', runId)
    .maybeSingle()
  const brand = run ? await loadBrand(run.brand_id) : null
  const summary: WeeklySummary = {
    status: 'succeeded',
    runId,
    weekStart,
    planned: results.length,
    submitted: results.filter((r) => r.outcome === 'submitted').length,
    scheduled: results.filter((r) => r.outcome === 'scheduled').length,
    returned: results.filter((r) => r.outcome === 'returned').length,
    budgetStopped: results.some((r) => r.outcome === 'budget'),
    errors: results.filter((r) => r.outcome === 'error').length,
    tokens: results.reduce((n, r) => n + r.tokens, 0),
  }
  if (summary.budgetStopped || summary.errors) summary.status = 'partial'
  await finishRun(
    runId,
    summary.status,
    { ...((run?.summary as Record<string, unknown>) ?? {}), ...summary },
    summary.tokens,
  )
  if (brand) {
    await budgetNotice(brand)
    await weeklyReport(brand, summary)
  }
  logger.info('autopilot_week_done', { ...summary })
  return summary
}

/** Nedeljni izveštaj (brif 9.3.6): šta je objavljeno prošle nedelje, rezultati i plan. */
async function weeklyReport(brand: BrandRow, summary: WeeklySummary): Promise<void> {
  const admin = createSupabaseAdminClient()
  const to = new Date()
  const from = new Date(to.getTime() - 7 * 86_400_000)
  let last = ''
  try {
    const o = await computeOverview(admin, brand.id, from.toISOString(), to.toISOString())
    last = `Prošle nedelje: ${o.totals.posts} objava, doseg ${o.totals.reach}, angažovanje ${o.totals.engagement}.`
  } catch (error) {
    logger.warn('autopilot_report_overview_failed', { brandId: brand.id, error })
  }
  const plan =
    `Za nedelju od ${summary.weekStart}: ${summary.planned} nacrta` +
    (summary.submitted ? `, ${summary.submitted} čeka odobrenje` : '') +
    (summary.scheduled ? `, ${summary.scheduled} zakazano` : '') +
    (summary.returned ? `, ${summary.returned} vraćeno na doradu` : '') +
    (summary.budgetStopped ? '; budžet je potrošen pre kraja' : '') +
    '.'
  await notifyRoles(brand, ['owner', 'admin'], {
    type: 'autopilot_weekly_report',
    title: `Autopilot: nedeljni izveštaj za ${brand.name}`,
    body: [last, plan].filter(Boolean).join(' '),
    link: summary.submitted ? '/app/posts?status=in_review' : '/app/calendar',
    data: { weekStart: summary.weekStart ?? '', runId: summary.runId ?? '' },
  })
}

export async function runWeeklyForBrand(
  job: WeeklyJob,
  run: StepRunner,
  now = new Date(),
): Promise<WeeklySummary> {
  const prep = await run('prepare', () => prepareWeek(job, now))
  if (prep.status === 'skipped')
    return { ...EMPTY, status: 'skipped', runId: prep.runId, reason: prep.reason }
  let strategyId: string
  if (prep.status === 'needs_strategy') {
    const gen = await run('strategy', async () => {
      const brand = (await loadBrand(job.brandId))!
      return generateAutopilotStrategy(brand, prep.weekStart, 4, prep.runId)
    })
    if (!gen.strategyId) {
      await run('no-strategy', async () => {
        const brand = (await loadBrand(job.brandId))!
        await suggestStrategy(brand, prep.weekStart, 'Autopilot nije mogao da napravi strategiju.')
        await finishRun(prep.runId, 'skipped', { reason: gen.reason ?? 'Strategija nije napravljena.' })
        if (gen.reason === 'budget') await budgetNotice(brand)
      })
      return {
        ...EMPTY,
        status: 'skipped',
        runId: prep.runId,
        reason: gen.reason ?? 'Strategija nije napravljena.',
        budgetStopped: gen.reason === 'budget',
      }
    }
    strategyId = gen.strategyId
  } else {
    strategyId = prep.strategyId
  }
  const postIds = await run('plan', () => planWeek(prep.runId, strategyId, prep.weekStart))
  const results: DraftResult[] = []
  for (const postId of postIds) {
    const r = await run(`draft-${postId}`, () => draftOne(prep.runId, postId))
    results.push(r)
    if (r.outcome === 'budget') break
  }
  return run('finish', () => finishWeek(prep.runId, prep.weekStart, results))
}

/** Brendovi kojima je nedeljni prolaz na redu (cron na sat, fan-out po brendu). */
export async function dueWeeklyBrands(
  now: Date,
  hourLocal = 6,
): Promise<Array<{ brandId: string; weekStart: string }>> {
  const admin = createSupabaseAdminClient()
  const { data: brands } = await admin
    .from('brands')
    .select('id, timezone')
    .gte('autopilot_level', 1)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(2000)
  const { isWeeklyRunDue } = await import('@/lib/autopilot/rules')
  const due = (brands ?? [])
    .filter((b) => isWeeklyRunDue(now, b.timezone, hourLocal))
    .map((b) => ({ brandId: b.id, weekStart: nextWeekRange(now, b.timezone).start }))
  if (!due.length) return []
  const { data: runs } = await admin
    .from('autopilot_runs')
    .select('brand_id, period_start')
    .eq('kind', 'weekly')
    .in(
      'brand_id',
      due.map((d) => d.brandId),
    )
  const done = new Set((runs ?? []).map((r) => `${r.brand_id}|${r.period_start}`))
  return due.filter((d) => !done.has(`${d.brandId}|${d.weekStart}`))
}

// ---------------------------------------------------------------------------
// Mesečni prolaz
// ---------------------------------------------------------------------------

export interface MonthlySummary {
  status: 'succeeded' | 'skipped' | 'failed'
  reason?: string
  periodStart?: string
  strategyId?: string | null
  suggested?: boolean
}

export async function runMonthlyForBrand(brandId: string, now = new Date()): Promise<MonthlySummary> {
  const brand = await loadBrand(brandId)
  if (!brand || brand.deleted_at || brand.status !== 'active')
    return { status: 'skipped', reason: 'Brend nije aktivan.' }
  const level = brand.autopilot_level as AutopilotLevel
  if (level < 1) return { status: 'skipped', reason: 'Autopilot je isključen.' }
  const periodStart = firstMondayNextMonth(now, brand.timezone)
  const admin = createSupabaseAdminClient()
  const { data: run, error } = await admin
    .from('autopilot_runs')
    .insert({
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      kind: 'monthly',
      period_start: periodStart,
      level,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505')
      return { status: 'skipped', reason: 'Mesečni prolaz je već urađen.', periodStart }
    throw error
  }
  const existing = await strategyCovering(brand.id, periodStart, ['draft', 'active'])
  if (existing) {
    await finishRun(run.id, 'skipped', {
      reason: 'Strategija za period već postoji.',
      strategyId: existing.id,
    })
    return {
      status: 'skipped',
      reason: 'Strategija za period već postoji.',
      periodStart,
      strategyId: existing.id,
    }
  }
  if (level === 1) {
    const suggested = await suggestStrategy(brand, periodStart, 'Bliži se novi mesec.')
    await finishRun(run.id, 'succeeded', { suggested })
    return { status: 'succeeded', periodStart, suggested }
  }
  const gen = await generateAutopilotStrategy(brand, periodStart, 4, run.id)
  if (!gen.strategyId) {
    await suggestStrategy(brand, periodStart, 'Autopilot nije mogao da napravi strategiju.')
    await finishRun(run.id, 'skipped', { reason: gen.reason ?? 'Strategija nije napravljena.' })
    if (gen.reason === 'budget') await budgetNotice(brand)
    return { status: 'skipped', reason: gen.reason, periodStart }
  }
  await finishRun(run.id, 'succeeded', { strategyId: gen.strategyId }, gen.tokens)
  await notifyRoles(brand, ['owner', 'admin'], {
    type: 'autopilot_strategy',
    title: `Autopilot je napravio strategiju za ${brand.name}`,
    body: `Strategija od ${periodStart} je aktivna; nacrti stižu nedelju po nedelju. Pregledajte je i menjajte po potrebi.`,
    link: '/app/strategy',
    data: { strategyId: gen.strategyId, periodStart },
  })
  return { status: 'succeeded', periodStart, strategyId: gen.strategyId }
}

export async function dueMonthlyBrands(now: Date, day = 25): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const { data: brands } = await admin
    .from('brands')
    .select('id, timezone')
    .gte('autopilot_level', 1)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(2000)
  const { isMonthlyRunDue } = await import('@/lib/autopilot/rules')
  return (brands ?? []).filter((b) => isMonthlyRunDue(now, b.timezone, day)).map((b) => b.id)
}
