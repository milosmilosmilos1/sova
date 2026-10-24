import 'server-only'

import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildInsightsPrompt,
  buildInsightsSystemPrompt,
  insightsJsonSchema,
  insightsOutputSchema,
} from '@/lib/ai/prompts/insights'
import type { Viewer } from '@/lib/auth/viewer'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { computeOverview, normalizeRange } from '@/services/analytics/overview'
import { getBrand } from '@/services/brands'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import type { Database, Json } from '@/types/database'

/**
 * AI uvidi (faza 10b): iz pregleda analitike model izvodi 3–5 tvrdnji sa preporukom, dokazima
 * (ID-jevi targeta) i pouzdanošću; do 2 uvida idu u Inbox kao predlozi (`suggestions`, source `insight`).
 * Nedeljno kroz cron (`analytics-insights-weekly`) ili ručno iz analitike; platforma plaća (0 tokena).
 */
export const MIN_POSTS_FOR_INSIGHTS = 3
const SUGGESTION_TTL_DAYS = 14

export interface InsightItem {
  claim: string
  recommendation: string
  evidenceTargetIds: string[]
  confidence: number
  suggestionKind: '' | 'post_idea' | 'repeat_format' | 'strategy_tweak' | 'campaign'
  suggestionTitle: string
  suggestionBody: string
}

export interface InsightView {
  id: string
  brandId: string
  periodStart: string
  periodEnd: string
  items: InsightItem[]
  createdAt: string
}

export interface InsightsResult {
  status: 'created' | 'skipped' | 'failed'
  insightId?: string
  items?: number
  suggestions?: number
  reason?: string
}

type InsightRow = Database['public']['Tables']['insights']['Row']

function toView(r: InsightRow): InsightView {
  return {
    id: r.id,
    brandId: r.brand_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    items: Array.isArray(r.items) ? (r.items as unknown as InsightItem[]) : [],
    createdAt: r.created_at,
  }
}

export async function generateInsights(
  brandId: string,
  opts: { from?: string | null; to?: string | null; userId: string | null; requestId?: string },
): Promise<InsightsResult> {
  const admin = createSupabaseAdminClient()
  const range = normalizeRange(
    opts.from ?? new Date(Date.now() - 7 * 86_400_000).toISOString(),
    opts.to ?? null,
  )
  const brand = unwrap(
    await admin.from('brands').select('*').eq('id', brandId).maybeSingle(),
    'Brend ne postoji.',
  )
  const overview = await computeOverview(admin, brandId, range.from, range.to)
  if (overview.totals.withMetrics < MIN_POSTS_FOR_INSIGHTS) {
    return {
      status: 'skipped',
      reason: `Premalo objava sa metrikama u periodu (${overview.totals.withMetrics}, treba bar ${MIN_POSTS_FOR_INSIGHTS}).`,
    }
  }
  const price = await getTokenPrice('insights')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId,
    userId: opts.userId,
    type: 'insights',
    tokens: price,
    input: { brandId, from: range.from, to: range.to },
    requestId: opts.requestId,
  })
  const started = Date.now()
  try {
    const context = await buildBrandContext(brand, 'analitika: koje teme i formati rade', undefined)
    const prompt = buildInsightsPrompt({
      brand: context,
      periodStart: range.from.slice(0, 10),
      periodEnd: range.to.slice(0, 10),
      totals: overview.totals,
      deltas: overview.deltas,
      perPlatform: overview.perPlatform.map((p) => ({
        label: p.platformLabel,
        posts: p.posts,
        reach: p.reach,
        engagement: p.engagement,
        engagementRate: p.engagementRate,
      })),
      perPillar: overview.perPillar.map((p) => ({
        label: p.label,
        posts: p.posts,
        reach: p.reach,
        engagement: p.engagement,
      })),
      topPosts: overview.topPosts.map((p) => ({
        id: p.targetId,
        platform: p.platform,
        publishedAt: p.publishedAt,
        excerpt: p.excerpt,
        reach: p.reach,
        engagement: p.engagement,
      })),
      weakPosts: overview.weakPosts.map((p) => ({
        id: p.targetId,
        platform: p.platform,
        publishedAt: p.publishedAt,
        excerpt: p.excerpt,
        reach: p.reach,
        engagement: p.engagement,
      })),
      followers: overview.followers.map((f) => ({
        account: f.name ?? f.accountId,
        first: f.first,
        last: f.last,
        delta: f.delta,
      })),
    })
    const outcome = await callWithFallback(
      textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildInsightsSystemPrompt(),
          prompt,
          jsonSchema: insightsJsonSchema(),
          maxOutputTokens: 4096,
          temperature: 0.4,
          thinking: 'low',
        }),
      { label: 'insights' },
    )
    const parsed = insightsOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi uvida.', {
        model: outcome.model,
      })
    }
    const knownTargets = new Set([...overview.topPosts, ...overview.weakPosts].map((p) => p.targetId))
    const items: InsightItem[] = parsed.data.items.slice(0, 5).map((i) => ({
      claim: i.claim.trim(),
      recommendation: i.recommendation.trim(),
      evidenceTargetIds: i.evidence_post_ids.filter((id) => knownTargets.has(id)),
      confidence: Math.max(0, Math.min(1, Math.round(i.confidence * 100) / 100)),
      suggestionKind: i.suggestion_kind,
      suggestionTitle: i.suggestion_title.trim().slice(0, 200),
      suggestionBody: i.suggestion_body.trim(),
    }))
    const insight = unwrap(
      await admin
        .from('insights')
        .insert({
          brand_id: brandId,
          period_start: range.from.slice(0, 10),
          period_end: range.to.slice(0, 10),
          items: items as unknown as NonNullable<Json>,
          ai_generation_id: generationId,
        })
        .select('*')
        .single(),
    )
    let suggestions = 0
    for (const i of items) {
      if (!i.suggestionKind) continue
      const { error } = await admin.from('suggestions').insert({
        brand_id: brandId,
        source: 'insight',
        kind: i.suggestionKind,
        title: i.suggestionTitle || i.claim.slice(0, 200),
        body: i.suggestionBody || i.recommendation,
        payload: {
          insightId: insight.id,
          claim: i.claim,
          recommendation: i.recommendation,
        } as unknown as NonNullable<Json>,
        evidence: { targetIds: i.evidenceTargetIds } as unknown as NonNullable<Json>,
        score: Math.round(i.confidence * 100),
        expires_at: new Date(Date.now() + SUGGESTION_TTL_DAYS * 86_400_000).toISOString(),
      })
      if (error) logger.warn('insight_suggestion_insert_failed', { brandId, error: error.message })
      else suggestions += 1
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
        output: { insightId: insight.id, items: items.length, suggestions },
        duration_ms: Date.now() - started,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    const admins = await usersWithRoles(brand.workspace_id, brandId, ['owner', 'admin'])
    await notifyUsers({
      userIds: admins,
      workspaceId: brand.workspace_id,
      brandId,
      type: 'insights_ready',
      title: `Novi uvidi za ${brand.name}`,
      body: items[0]?.claim ?? null,
      link: '/app/analytics',
      data: { insightId: insight.id, suggestions },
    })
    logger.info('insights_generated', {
      brandId,
      insightId: insight.id,
      items: items.length,
      suggestions,
      model: outcome.model,
    })
    return { status: 'created', insightId: insight.id, items: items.length, suggestions }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message, {
      duration_ms: Date.now() - started,
    })
    logger.warn('insights_failed', { brandId, code: api.code, message: api.message })
    return { status: 'failed', reason: api.message }
  }
}

export async function listInsights(viewer: Viewer, brandId: string, limit = 10): Promise<InsightView[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('insights')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50))
  if (error) throw mapDbError(error)
  return (data ?? []).map(toView)
}

export interface WeeklyInsightsSummary {
  brands: number
  created: number
  skipped: number
  failed: number
}

/** Nedeljni prolaz: aktivni brendovi sa bar jednim aktivnim nalogom, poslednjih 7 dana. */
export async function runWeeklyInsights(now = new Date()): Promise<WeeklyInsightsSummary> {
  const admin = createSupabaseAdminClient()
  const { data: accounts } = await admin.from('social_accounts').select('brand_id').eq('status', 'active')
  const brandIds = [...new Set((accounts ?? []).map((a) => a.brand_id))]
  const summary: WeeklyInsightsSummary = { brands: 0, created: 0, skipped: 0, failed: 0 }
  if (!brandIds.length) return summary
  const { data: brands } = await admin
    .from('brands')
    .select('id')
    .in('id', brandIds)
    .eq('status', 'active')
    .is('deleted_at', null)
  const to = now.toISOString()
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  for (const b of brands ?? []) {
    summary.brands += 1
    const r = await generateInsights(b.id, { from, to, userId: null })
    summary[r.status === 'created' ? 'created' : r.status === 'skipped' ? 'skipped' : 'failed'] += 1
  }
  logger.info('weekly_insights', { ...summary })
  return summary
}
