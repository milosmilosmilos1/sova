import 'server-only'

import { isProviderError } from '@/integrations/social/errors'
import { providerFor } from '@/integrations/social/registry'
import type { NormalizedMetrics } from '@/integrations/social/types'
import type { SocialPlatform } from '@/config/platforms'
import { ANALYTICS_TARGET_STATUSES, type CaptureHorizon, type Horizon } from '@/lib/analytics/aggregate'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { markAccountStatus, refFor } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'
import type { Json } from '@/types/database'

/**
 * Povlačenje metrika (faza 10b): snimci po objavi na +1 h, +24 h, +7 d, +30 d (Inngest `post-metrics`)
 * i dnevne metrike naloga (cron `social-account-metrics`). Mreža koja vrati „objekat ne postoji”
 * prebacuje target u `deleted_externally` (N6); istekao token → nalog `needs_reauth`.
 */
export type CaptureStatus = 'captured' | 'skipped' | 'deleted' | 'failed'

export interface CaptureResult {
  status: CaptureStatus
  reason?: string
}

/** Meta vraća HTTP 400, code 100, subcode 33 za obrisane ili nedostupne objekte; neke mreže 404. */
export function isGoneError(error: unknown): boolean {
  if (!isProviderError(error)) return false
  if (error.status === 404) return true
  const raw = (error.raw ?? {}) as { code?: number; error_subcode?: number }
  if (raw.code === 100 && raw.error_subcode === 33) return true
  return /does not exist|not found|deleted/i.test(error.message)
}

/**
 * Koje mreže imaju metrike u Sovi. Objave: Google poslovni profil ih nema kroz API, Pinterest zabranjuje
 * čuvanje podataka iz API-ja (D-085), X naplaćuje svako čitanje pa se prate samo 24 h i 7 dana (D-083).
 * Dnevne metrike naloga: X se ne povlači svaki dan (pratioci se osvežavaju pri sinhronizaciji naloga).
 */
const POST_METRICS_PLATFORMS: readonly SocialPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'x',
]
const ACCOUNT_METRICS_PLATFORMS: readonly SocialPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'google_business',
]
export const POST_METRIC_HORIZONS: Partial<Record<SocialPlatform, readonly CaptureHorizon[]>> = {
  x: ['24h', '7d'],
}

export async function publishedAtOf(targetId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('post_targets')
    .select('published_at, status, external_post_id')
    .eq('id', targetId)
    .maybeSingle()
  if (!data || !data.published_at || !data.external_post_id) return null
  if (!(ANALYTICS_TARGET_STATUSES as readonly string[]).includes(data.status)) return null
  return data.published_at
}

function toSnapshot(m: NormalizedMetrics) {
  const engagement = m.engagement ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)
  return {
    impressions: m.impressions,
    reach: m.reach,
    reactions: m.likes,
    comments: m.comments,
    shares: m.shares,
    saves: m.saves,
    link_clicks: m.clicks,
    video_views: m.videoViews ?? null,
    engagement_rate: m.reach && m.reach > 0 ? Math.round((engagement / m.reach) * 100000) / 100000 : null,
    raw: { ...m.raw, engagement } as unknown as NonNullable<Json>,
  }
}

export async function capturePostMetrics(targetId: string, horizon: Horizon): Promise<CaptureResult> {
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin.from('post_targets').select('*').eq('id', targetId).maybeSingle()
  if (!target) return { status: 'skipped', reason: 'target ne postoji' }
  if (!(ANALYTICS_TARGET_STATUSES as readonly string[]).includes(target.status) || !target.external_post_id) {
    return { status: 'skipped', reason: `target je ${target.status} bez ID-ja objave` }
  }
  if (!POST_METRICS_PLATFORMS.includes(target.platform)) {
    return { status: 'skipped', reason: `mreža ${target.platform} nema metrike objava` }
  }
  const horizons = POST_METRIC_HORIZONS[target.platform]
  if (horizon !== 'adhoc' && horizons && !horizons.includes(horizon)) {
    return { status: 'skipped', reason: `horizont ${horizon} se ne prati za mrežu ${target.platform}` }
  }
  if (horizon !== 'adhoc') {
    const { count } = await admin
      .from('post_metrics_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', targetId)
      .eq('horizon', horizon)
    if (count) return { status: 'skipped', reason: 'snimak za taj horizont već postoji' }
  }
  const { data: account } = await admin
    .from('social_accounts')
    .select('*')
    .eq('id', target.social_account_id)
    .maybeSingle()
  if (!account) return { status: 'skipped', reason: 'nalog ne postoji' }
  if (account.status !== 'active') return { status: 'skipped', reason: `nalog je ${account.status}` }
  try {
    const provider = providerFor(target.platform)
    const token = await accessTokenFor(account)
    let externalId = target.external_post_id
    // TikTok daje ID objave tek posle moderacije; do tada je u bazi `publish:<id>`
    if (provider.resolveExternalId && externalId.startsWith('publish:')) {
      const resolved = await provider.resolveExternalId(externalId, refFor(account), token)
      if (resolved) {
        externalId = resolved.externalId
        await admin
          .from('post_targets')
          .update({ external_post_id: resolved.externalId, permalink: resolved.permalink })
          .eq('id', target.id)
      }
    }
    const metrics = await provider.fetchPostMetrics(externalId, refFor(account), token)
    const { error } = await admin.from('post_metrics_snapshots').insert({
      target_id: target.id,
      social_account_id: account.id,
      brand_id: target.brand_id,
      horizon,
      ...toSnapshot(metrics),
    })
    if (error) {
      if (error.code === '23505') return { status: 'skipped', reason: 'snimak već postoji' }
      throw error
    }
    logger.info('post_metrics_captured', { targetId, horizon, platform: target.platform })
    return { status: 'captured' }
  } catch (error) {
    if (isGoneError(error)) {
      await admin
        .from('post_targets')
        .update({
          status: 'deleted_externally',
          last_error_code: 'DELETED_EXTERNALLY',
          last_error_message: 'Objava više ne postoji na mreži.',
        })
        .eq('id', target.id)
        .eq('status', target.status)
      logger.warn('post_deleted_externally', { targetId, platform: target.platform })
      return { status: 'deleted', reason: 'objava obrisana na mreži' }
    }
    const message = error instanceof Error ? error.message : 'Metrike nisu povučene.'
    if (isProviderError(error) && (error.code === 'TOKEN_INVALID' || error.code === 'PERMISSION_LOST')) {
      await markAccountStatus(account.id, 'needs_reauth', error.userMessage, message)
      return { status: 'failed', reason: error.userMessage }
    }
    if (isProviderError(error) && error.retryable) throw error
    logger.warn('post_metrics_failed', { targetId, horizon, message })
    return { status: 'failed', reason: message }
  }
}

export async function captureAccountMetrics(accountId: string, date: string): Promise<CaptureResult> {
  const admin = createSupabaseAdminClient()
  const { data: account } = await admin.from('social_accounts').select('*').eq('id', accountId).maybeSingle()
  if (!account) return { status: 'skipped', reason: 'nalog ne postoji' }
  if (account.status !== 'active') return { status: 'skipped', reason: `nalog je ${account.status}` }
  if (!ACCOUNT_METRICS_PLATFORMS.includes(account.platform)) {
    return { status: 'skipped', reason: `mreža ${account.platform} nema dnevne metrike naloga` }
  }
  try {
    const m = await providerFor(account.platform).fetchAccountMetrics(
      refFor(account),
      await accessTokenFor(account),
      date,
    )
    const { error } = await admin.from('account_metrics_daily').upsert(
      {
        social_account_id: account.id,
        brand_id: account.brand_id,
        date,
        followers: m.followers,
        reach: m.reach,
        impressions: m.impressions,
        profile_views: m.profileViews,
        website_clicks: m.websiteClicks ?? null,
        raw: { ...m.raw, engagement: m.engagement } as unknown as NonNullable<Json>,
        captured_at: new Date().toISOString(),
      },
      { onConflict: 'social_account_id,date' },
    )
    if (error) throw error
    return { status: 'captured' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metrike naloga nisu povučene.'
    if (isProviderError(error) && (error.code === 'TOKEN_INVALID' || error.code === 'PERMISSION_LOST')) {
      await markAccountStatus(account.id, 'needs_reauth', error.userMessage, message)
      return { status: 'failed', reason: error.userMessage }
    }
    logger.warn('account_metrics_failed', { accountId, date, message })
    return { status: 'failed', reason: message }
  }
}

export interface SweepSummary {
  date: string
  checked: number
  captured: number
  skipped: number
  failed: number
}

/** Dnevni prolaz kroz aktivne naloge za jučerašnji dan (po UTC); svaki nalog nezavisno. */
export async function runAccountMetricsSweep(date?: string): Promise<SweepSummary> {
  const day = date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const admin = createSupabaseAdminClient()
  const { data: accounts } = await admin
    .from('social_accounts')
    .select('id')
    .eq('status', 'active')
    .in('platform', [...ACCOUNT_METRICS_PLATFORMS])
    .limit(1000)
  const summary: SweepSummary = {
    date: day,
    checked: accounts?.length ?? 0,
    captured: 0,
    skipped: 0,
    failed: 0,
  }
  for (const a of accounts ?? []) {
    const r = await captureAccountMetrics(a.id, day)
    if (r.status === 'captured') summary.captured += 1
    else if (r.status === 'skipped') summary.skipped += 1
    else summary.failed += 1
  }
  logger.info('account_metrics_sweep', { ...summary })
  return summary
}
