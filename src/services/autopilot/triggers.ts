import 'server-only'

import { PLATFORMS } from '@/config/platforms'
import {
  ANALYTICS_TARGET_STATUSES,
  engagementOfSnapshot,
  latestSnapshots,
  type Horizon,
  type SnapshotLite,
} from '@/lib/analytics/aggregate'
import { holidaysInWindow, isOutlier, localParts } from '@/lib/autopilot/rules'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/**
 * Reaktivni okidači (brif 9.3.5) i održavanje Inbox-a: praznik u narednih 7 dana, objava sa
 * dvostruko većim angažovanjem od proseka (predlog da se format ponovi), istek predloga.
 * Novi blog i promene sajta već pravi nedeljna provera sajta (faza 6).
 */
export async function expireSuggestions(now = new Date()): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('suggestions')
    .update({ status: 'expired' })
    .eq('status', 'new')
    .lt('expires_at', now.toISOString())
    .select('id')
  return data?.length ?? 0
}

export async function holidaySuggestions(now = new Date()): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data: brands } = await admin
    .from('brands')
    .select('id, timezone, content_locale')
    .gte('autopilot_level', 1)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(2000)
  if (!brands?.length) return 0
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.getTime() + 8 * 86_400_000).toISOString().slice(0, 10)
  const { data: holidays } = await admin
    .from('holidays')
    .select('country, date, name, kind')
    .gte('date', today)
    .lte('date', horizon)
  let created = 0
  for (const b of brands) {
    const localToday = localParts(now, b.timezone).date
    const countries = b.content_locale.startsWith('sr') ? ['RS', 'GLOBAL'] : ['GLOBAL']
    const upcoming = holidaysInWindow(
      (holidays ?? []).filter((h) => countries.includes(h.country)),
      localToday,
    )
    for (const h of upcoming) {
      const { count } = await admin
        .from('suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', b.id)
        .eq('source', 'holiday')
        .contains('payload', { date: h.date, name: h.name })
      if (count) continue
      const { error } = await admin.from('suggestions').insert({
        brand_id: b.id,
        source: 'holiday',
        kind: 'post_idea',
        title: `${h.name} (${h.date.slice(8, 10)}.${h.date.slice(5, 7)}.)`,
        body: `Za ${h.name} pripremite prigodnu objavu: čestitku, radno vreme ili ponudu vezanu za praznik.`,
        payload: { date: h.date, name: h.name, kind: h.kind } as unknown as NonNullable<Json>,
        score: h.kind === 'public' ? 70 : 55,
        expires_at: new Date(`${h.date}T23:59:59Z`).toISOString(),
      })
      if (!error) created += 1
    }
  }
  if (created) logger.info('holiday_suggestions', { created })
  return created
}

/** Posle snimka od 24 h: objava sa ≥ 2× prosečnim angažovanjem brenda (30 dana, bar 5 objava) → predlog. */
export async function checkOutlier(targetId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin
    .from('post_targets')
    .select('id, brand_id, post_id, platform, status, permalink')
    .eq('id', targetId)
    .maybeSingle()
  if (!target || !(ANALYTICS_TARGET_STATUSES as readonly string[]).includes(target.status)) return false
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: others } = await admin
    .from('post_targets')
    .select('id')
    .eq('brand_id', target.brand_id)
    .in('status', [...ANALYTICS_TARGET_STATUSES])
    .gte('published_at', since)
    .limit(200)
  const ids = (others ?? []).map((o) => o.id)
  if (!ids.includes(targetId)) ids.push(targetId)
  const { data: snaps } = await admin
    .from('post_metrics_snapshots')
    .select(
      'target_id, horizon, captured_at, impressions, reach, reactions, comments, shares, saves, link_clicks, engagement_rate',
    )
    .in('target_id', ids)
  const latest = latestSnapshots(
    (snaps ?? []).map((s): SnapshotLite => ({
      targetId: s.target_id,
      horizon: s.horizon as Horizon,
      capturedAt: s.captured_at,
      impressions: s.impressions,
      reach: s.reach,
      reactions: s.reactions,
      comments: s.comments,
      shares: s.shares,
      saves: s.saves,
      linkClicks: s.link_clicks,
      engagementRate: s.engagement_rate === null ? null : Number(s.engagement_rate),
    })),
  )
  const mine = latest.get(targetId)
  if (!mine) return false
  const engagement = engagementOfSnapshot(mine)
  const baseline = [...latest.entries()]
    .filter(([id]) => id !== targetId)
    .map(([, s]) => engagementOfSnapshot(s))
  if (!isOutlier(engagement, baseline)) return false
  const { count } = await admin
    .from('suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', target.brand_id)
    .eq('kind', 'repeat_format')
    .contains('evidence', { targetIds: [targetId] })
  if (count) return false
  const { data: post } = await admin
    .from('posts')
    .select('title, master_text')
    .eq('id', target.post_id)
    .maybeSingle()
  const avg = Math.round(baseline.reduce((a, b) => a + b, 0) / baseline.length)
  const excerpt = (post?.title ?? post?.master_text ?? '').replace(/\s+/g, ' ').slice(0, 120)
  await admin.from('suggestions').insert({
    brand_id: target.brand_id,
    source: 'analytics',
    kind: 'repeat_format',
    title: `Ponovite format: ${PLATFORMS[target.platform].label} objava sa ${engagement} interakcija`,
    body: `Objava „${excerpt}” ima ${engagement} interakcija, više od dvostrukog proseka (${avg}). Napravite sličnu objavu sa novom temom.`,
    payload: {
      postId: target.post_id,
      targetId,
      engagement,
      average: avg,
      text: post?.master_text ?? '',
    } as unknown as NonNullable<Json>,
    evidence: { targetIds: [targetId], permalink: target.permalink } as unknown as NonNullable<Json>,
    score: 75,
    expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  })
  logger.info('outlier_suggestion', { targetId, engagement, average: avg })
  return true
}
