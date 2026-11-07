import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import {
  ANALYTICS_TARGET_STATUSES,
  dailySeries,
  followersSeries,
  groupTotals,
  latestSnapshots,
  pctDelta,
  periodBefore,
  topTargets,
  totalsOf,
  type DailyPoint,
  type FollowerSeries,
  type GroupRow,
  type Horizon,
  type SnapshotLite,
  type TargetLite,
  type Totals,
} from '@/lib/analytics/aggregate'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { mapDbError } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import type { Database } from '@/types/database'

/**
 * Pregled analitike (faza 10b): objavljeni targeti u periodu + merodavan snimak metrika po targetu,
 * zbirovi, mreže, stubovi, najbolje objave, pratioci po nalogu i poređenje sa prethodnim periodom.
 * Isti kod radi za korisnika (RLS) i za cron (service role) kroz prosleđen klijent.
 */
type Client = SupabaseClient<Database>

/** redosled horizonata u prikazu (od najranijeg snimka) */
const HORIZON_ORDER: Horizon[] = ['1h', '24h', '7d', '30d', 'adhoc']

export interface AccountLite {
  id: string
  platform: SocialPlatform
  name: string
}

export interface TopPost {
  targetId: string
  postId: string
  platform: SocialPlatform
  accountName: string | null
  publishedAt: string
  permalink: string | null
  title: string | null
  excerpt: string
  pillarName: string | null
  reach: number | null
  impressions: number | null
  engagement: number
  engagementRate: number | null
  horizon: Horizon
}

export interface OverviewData {
  from: string
  to: string
  totals: Totals
  previous: Totals
  deltas: {
    posts: number | null
    reach: number | null
    engagement: number | null
    engagementRate: number | null
  }
  perPlatform: Array<GroupRow<SocialPlatform> & { platformLabel: string }>
  perPillar: GroupRow<string>[]
  /** doseg i angažovanje po danu objave, u zoni brenda */
  daily: DailyPoint[]
  topPosts: TopPost[]
  weakPosts: TopPost[]
  followers: Array<FollowerSeries & { platform: SocialPlatform | null; name: string | null }>
  accounts: AccountLite[]
  notes: string[]
}

export interface OverviewView extends OverviewData {
  timezone: string
}

/**
 * Objavljene stavke perioda sa objavom, stubom i snimcima metrika u jednom upitu (D-164). Ranije su
 * objave, stubovi i snimci išli posle stavki, svaki u svom krugu do baze. Ugnježdeni redovi prolaze kroz
 * isti RLS kao posebni upiti, pa obrisana objava i dalje daje stavku bez naslova.
 */
const TARGET_SELECT =
  'id, post_id, platform, social_account_id, published_at, permalink, ' +
  'posts!post_targets_post_id_fkey(title, master_text, pillar_id, content_pillars!posts_pillar_id_fkey(name)), ' +
  'post_metrics_snapshots!post_metrics_snapshots_target_id_fkey(horizon, captured_at, impressions, reach, reactions, comments, shares, saves, link_clicks, engagement_rate)'

interface TargetRow {
  id: string
  post_id: string
  platform: SocialPlatform
  social_account_id: string
  published_at: string | null
  permalink: string | null
  posts: {
    title: string | null
    master_text: string | null
    pillar_id: string | null
    content_pillars: { name: string } | null
  } | null
  post_metrics_snapshots: Array<{
    horizon: string
    captured_at: string
    impressions: number | null
    reach: number | null
    reactions: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    link_clicks: number | null
    engagement_rate: number | string | null
  }>
}

async function loadTargets(
  client: Client,
  brandId: string,
  from: string,
  to: string,
): Promise<{ targets: TargetLite[]; snapshots: SnapshotLite[] }> {
  const { data, error } = await client
    .from('post_targets')
    .select(TARGET_SELECT)
    .eq('brand_id', brandId)
    .in('status', [...ANALYTICS_TARGET_STATUSES])
    .gte('published_at', from)
    .lte('published_at', to)
    .order('published_at', { ascending: false })
    .limit(2000)
  if (error) throw mapDbError(error)
  const rows = ((data ?? []) as unknown as TargetRow[]).filter((t) => t.published_at)
  const targets = rows.map((t): TargetLite => {
    const p = t.posts
    return {
      targetId: t.id,
      postId: t.post_id,
      platform: t.platform,
      socialAccountId: t.social_account_id,
      publishedAt: t.published_at!,
      permalink: t.permalink,
      pillarId: p?.pillar_id ?? null,
      pillarName: p?.pillar_id ? (p.content_pillars?.name ?? null) : null,
      title: p?.title ?? null,
      excerpt: (p?.master_text ?? '').replace(/\s+/g, ' ').slice(0, 140),
    }
  })
  const snapshots = rows.flatMap((t) =>
    (t.post_metrics_snapshots ?? []).map((s): SnapshotLite => ({
      targetId: t.id,
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
  return { targets, snapshots }
}

export async function computeOverview(
  client: Client,
  brandId: string,
  from: string,
  to: string,
  /** zona brenda za dnevni niz; može i obećanje (getOverview čita brend u istom krugu kao podatke) */
  timeZone: string | Promise<string> = 'UTC',
  /** period za poređenje; podrazumevano isto trajanje neposredno pre (izveštaj daje prethodni mesec) */
  prevRange: { from: string; to: string } = periodBefore(from, to),
): Promise<OverviewData> {
  // sve u jednom krugu do baze (D-164): stavke sa metrikama za oba perioda, nalozi i pratioci
  const [current, prior, accountsRes, followerRes] = await Promise.all([
    loadTargets(client, brandId, from, to),
    loadTargets(client, brandId, prevRange.from, prevRange.to),
    client.from('social_accounts').select('id, platform, name').eq('brand_id', brandId),
    client
      .from('account_metrics_daily')
      .select('social_account_id, date, followers')
      .eq('brand_id', brandId)
      .gte('date', from.slice(0, 10))
      .lte('date', to.slice(0, 10))
      .order('date', { ascending: true }),
  ])
  const targets = current.targets
  const prevTargets = prior.targets
  const accounts: AccountLite[] = (accountsRes.data ?? []).map((a) => ({
    id: a.id,
    platform: a.platform,
    name: a.name,
  }))
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const latest = latestSnapshots(current.snapshots)
  const prevLatest = latestSnapshots(prior.snapshots)
  const totals = totalsOf(targets, latest)
  const previous = totalsOf(prevTargets, prevLatest)

  const followerRows = followerRes.data
  const followers = followersSeries(
    (followerRows ?? []).map((r) => ({
      accountId: r.social_account_id,
      date: r.date,
      followers: r.followers,
    })),
  ).map((f) => ({
    ...f,
    platform: accountById.get(f.accountId)?.platform ?? null,
    name: accountById.get(f.accountId)?.name ?? null,
  }))

  const notes: string[] = []
  if (totals.posts && totals.withMetrics < totals.posts) {
    notes.push(
      `${totals.posts - totals.withMetrics} objava još nema metrike: prvi snimak stiže sat vremena posle objave, zatim posle 24 h, 7 i 30 dana.`,
    )
  }
  if (!followers.length)
    notes.push(
      'Dnevne metrike naloga (pratioci, doseg profila) stižu svakog dana u 04:00 UTC posle prvog punog dana.',
    )

  const ranked: TopPost[] = topTargets(targets, latest, targets.length).map(
    ({ target, snapshot, engagement }) => ({
      targetId: target.targetId,
      postId: target.postId,
      platform: target.platform,
      accountName: accountById.get(target.socialAccountId)?.name ?? null,
      publishedAt: target.publishedAt,
      permalink: target.permalink,
      title: target.title,
      excerpt: target.excerpt,
      pillarName: target.pillarName,
      reach: snapshot?.reach ?? null,
      impressions: snapshot?.impressions ?? null,
      engagement,
      engagementRate: snapshot?.engagementRate ?? null,
      horizon: snapshot?.horizon ?? 'adhoc',
    }),
  )

  return {
    from,
    to,
    totals,
    previous,
    deltas: {
      posts: pctDelta(totals.posts, previous.posts),
      reach: pctDelta(totals.reach, previous.reach),
      engagement: pctDelta(totals.engagement, previous.engagement),
      engagementRate:
        totals.engagementRate !== null && previous.engagementRate !== null
          ? pctDelta(totals.engagementRate, previous.engagementRate)
          : null,
    },
    perPlatform: groupTotals(targets, latest, (t) => ({
      key: t.platform,
      label: PLATFORMS[t.platform].label,
    })).map((r) => ({
      ...r,
      platformLabel: r.label,
    })),
    perPillar: groupTotals(targets, latest, (t) =>
      t.pillarId ? { key: t.pillarId, label: t.pillarName ?? 'Stub' } : null,
    ),
    daily: dailySeries(targets, latest, from, to, await timeZone),
    topPosts: ranked.slice(0, 5),
    weakPosts: ranked.length > 5 ? ranked.slice(-3).reverse() : [],
    followers,
    accounts,
    notes,
  }
}

const MAX_RANGE_DAYS = 366

export function normalizeRange(from?: string | null, to?: string | null): { from: string; to: string } {
  const toDate = to ? new Date(to.length === 10 ? `${to}T23:59:59.999Z` : to) : new Date()
  const fromDate = from
    ? new Date(from.length === 10 ? `${from}T00:00:00.000Z` : from)
    : new Date(toDate.getTime() - 29 * 86_400_000)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()))
    throw new ApiError('VALIDATION', 'Neispravan opseg datuma.')
  if (fromDate >= toDate) throw new ApiError('VALIDATION', 'Početak opsega mora biti pre kraja.')
  if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * 86_400_000)
    throw new ApiError('VALIDATION', 'Opseg može biti najviše godinu dana.')
  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

export async function getOverview(
  viewer: Viewer,
  brandId: string,
  from?: string | null,
  to?: string | null,
): Promise<OverviewView> {
  const range = normalizeRange(from, to)
  // provera brenda u istom krugu kao podaci: upiti idu kroz RLS, a bez pristupa poziv i dalje pada sa 404
  const brand = getBrand(viewer, brandId)
  const timeZone = brand.then((b) => b.timezone)
  timeZone.catch(() => undefined)
  const data = await computeOverview(viewer.supabase, brandId, range.from, range.to, timeZone)
  return { ...data, timezone: (await brand).timezone }
}

export interface PostMetricsRow extends TopPost {
  horizonsCaptured: Horizon[]
  comments: number | null
  reactions: number | null
  shares: number | null
  saves: number | null
  linkClicks: number | null
}

export async function listPostMetrics(
  viewer: Viewer,
  brandId: string,
  opts: { from?: string | null; to?: string | null; platform?: SocialPlatform | null; limit?: number },
): Promise<{ items: PostMetricsRow[]; from: string; to: string }> {
  const range = normalizeRange(opts.from, opts.to)
  // provera brenda, stavke sa metrikama i nalozi u jednom krugu (D-164); upiti idu kroz RLS
  const [, loaded, { data: accounts }] = await Promise.all([
    getBrand(viewer, brandId),
    loadTargets(viewer.supabase, brandId, range.from, range.to),
    viewer.supabase.from('social_accounts').select('id, name').eq('brand_id', brandId),
  ])
  let targets = loaded.targets
  if (opts.platform) targets = targets.filter((t) => t.platform === opts.platform)
  targets = targets.slice(0, Math.min(Math.max(opts.limit ?? 100, 1), 500))
  const picked = new Set(targets.map((t) => t.targetId))
  const snaps = loaded.snapshots.filter((s) => picked.has(s.targetId))
  const latest = latestSnapshots(snaps)
  const horizons = new Map<string, Horizon[]>()
  for (const s of snaps) horizons.set(s.targetId, [...(horizons.get(s.targetId) ?? []), s.horizon])
  const nameById = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const items: PostMetricsRow[] = targets.map((t) => {
    const s = latest.get(t.targetId)
    const engagement = s ? (s.reactions ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0) : 0
    return {
      targetId: t.targetId,
      postId: t.postId,
      platform: t.platform,
      accountName: nameById.get(t.socialAccountId) ?? null,
      publishedAt: t.publishedAt,
      permalink: t.permalink,
      title: t.title,
      excerpt: t.excerpt,
      pillarName: t.pillarName,
      reach: s?.reach ?? null,
      impressions: s?.impressions ?? null,
      engagement,
      engagementRate: s?.engagementRate ?? null,
      horizon: s?.horizon ?? 'adhoc',
      horizonsCaptured: [...new Set(horizons.get(t.targetId) ?? [])].sort(
        (a, b) => HORIZON_ORDER.indexOf(a) - HORIZON_ORDER.indexOf(b),
      ),
      comments: s?.comments ?? null,
      reactions: s?.reactions ?? null,
      shares: s?.shares ?? null,
      saves: s?.saves ?? null,
      linkClicks: s?.linkClicks ?? null,
    }
  })
  return { items, from: range.from, to: range.to }
}
