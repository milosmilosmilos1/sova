import type { SocialPlatform } from '@/config/platforms'

/**
 * Čista pravila analitike (faza 10b): koji snimak metrika važi za target, zbirovi po periodu,
 * mreži i stubu, promene u odnosu na prethodni period, pratioci po nalogu. Bez baze.
 */
export type Horizon = '1h' | '24h' | '7d' | '30d' | 'adhoc'
export const CAPTURE_HORIZONS = ['1h', '24h', '7d', '30d'] as const
export type CaptureHorizon = (typeof CAPTURE_HORIZONS)[number]

export const HORIZON_MS: Record<CaptureHorizon, number> = {
  '1h': 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
}

/** duži horizont je merodavniji; adhoc (ručno osveženo) je najsvežiji ali bez garancije starosti */
const HORIZON_RANK: Record<Horizon, number> = { '30d': 5, '7d': 4, '24h': 3, '1h': 2, adhoc: 1 }

/** statusi targeta koji ulaze u analitiku objavljenog (obrisano na mreži se ne broji) */
export const ANALYTICS_TARGET_STATUSES = ['published', 'assisted_done'] as const

export function horizonDue(publishedAt: string, horizon: CaptureHorizon): Date {
  return new Date(new Date(publishedAt).getTime() + HORIZON_MS[horizon])
}

export interface SnapshotLite {
  targetId: string
  horizon: Horizon
  capturedAt: string
  impressions: number | null
  reach: number | null
  reactions: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  linkClicks: number | null
  engagementRate: number | null
}

export interface TargetLite {
  targetId: string
  postId: string
  platform: SocialPlatform
  socialAccountId: string
  publishedAt: string
  permalink: string | null
  pillarId: string | null
  pillarName: string | null
  title: string | null
  excerpt: string
}

/** Po targetu: snimak najdužeg horizonta, a pri istom horizontu najsvežiji. */
export function latestSnapshots(snaps: SnapshotLite[]): Map<string, SnapshotLite> {
  const out = new Map<string, SnapshotLite>()
  for (const s of snaps) {
    const cur = out.get(s.targetId)
    if (!cur) {
      out.set(s.targetId, s)
      continue
    }
    const better =
      HORIZON_RANK[s.horizon] > HORIZON_RANK[cur.horizon] ||
      (HORIZON_RANK[s.horizon] === HORIZON_RANK[cur.horizon] && s.capturedAt > cur.capturedAt)
    if (better) out.set(s.targetId, s)
  }
  return out
}

export function engagementOfSnapshot(s: SnapshotLite | undefined): number {
  if (!s) return 0
  return (s.reactions ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0)
}

export interface Totals {
  posts: number
  withMetrics: number
  impressions: number
  reach: number
  engagement: number
  /** angažovanje / doseg, null kad nema dosega */
  engagementRate: number | null
}

export function totalsOf(targets: TargetLite[], latest: Map<string, SnapshotLite>): Totals {
  let impressions = 0
  let reach = 0
  let engagement = 0
  let withMetrics = 0
  for (const t of targets) {
    const s = latest.get(t.targetId)
    if (!s) continue
    withMetrics += 1
    impressions += s.impressions ?? 0
    reach += s.reach ?? 0
    engagement += engagementOfSnapshot(s)
  }
  return {
    posts: targets.length,
    withMetrics,
    impressions,
    reach,
    engagement,
    engagementRate: reach > 0 ? Math.round((engagement / reach) * 10000) / 10000 : null,
  }
}

export interface GroupRow<K extends string> {
  key: K
  label: string
  posts: number
  reach: number
  engagement: number
  engagementRate: number | null
}

export function groupTotals<K extends string>(
  targets: TargetLite[],
  latest: Map<string, SnapshotLite>,
  keyOf: (t: TargetLite) => { key: K; label: string } | null,
): GroupRow<K>[] {
  const map = new Map<K, GroupRow<K>>()
  for (const t of targets) {
    const k = keyOf(t)
    if (!k) continue
    const row = map.get(k.key) ?? {
      key: k.key,
      label: k.label,
      posts: 0,
      reach: 0,
      engagement: 0,
      engagementRate: null,
    }
    row.posts += 1
    const s = latest.get(t.targetId)
    row.reach += s?.reach ?? 0
    row.engagement += engagementOfSnapshot(s)
    map.set(k.key, row)
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      engagementRate: r.reach > 0 ? Math.round((r.engagement / r.reach) * 10000) / 10000 : null,
    }))
    .sort((a, b) => b.engagement - a.engagement || b.posts - a.posts)
}

/** promena u procentima; null kad prethodni period nema vrednost */
export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function periodBefore(from: string, to: string): { from: string; to: string } {
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  const len = Math.max(t - f, 86_400_000)
  return { from: new Date(f - len).toISOString(), to: new Date(f - 1).toISOString() }
}

export interface FollowerPoint {
  accountId: string
  date: string
  followers: number | null
}

export interface FollowerSeries {
  accountId: string
  first: number | null
  last: number | null
  delta: number | null
  points: Array<{ date: string; followers: number }>
}

export function followersSeries(points: FollowerPoint[]): FollowerSeries[] {
  const by = new Map<string, Array<{ date: string; followers: number }>>()
  for (const p of points) {
    if (p.followers === null) continue
    by.set(p.accountId, [...(by.get(p.accountId) ?? []), { date: p.date, followers: p.followers }])
  }
  return [...by.entries()].map(([accountId, list]) => {
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0]?.followers ?? null
    const last = sorted[sorted.length - 1]?.followers ?? null
    return {
      accountId,
      first,
      last,
      delta: first !== null && last !== null ? last - first : null,
      points: sorted,
    }
  })
}

export function topTargets(targets: TargetLite[], latest: Map<string, SnapshotLite>, limit = 5) {
  return [...targets]
    .map((t) => ({
      target: t,
      snapshot: latest.get(t.targetId),
      engagement: engagementOfSnapshot(latest.get(t.targetId)),
    }))
    .filter((x) => x.snapshot)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, limit)
}

export interface DailyPoint {
  date: string
  posts: number
  reach: number
  engagement: number
}

/**
 * Doseg i angažovanje po danu objave, u zoni brenda (grafikon trenda, D-062): svaka objava doprinosi
 * svom danu merodavnim snimkom. Dani bez objava su nule, da linija ne preskače period.
 */
export function dailySeries(
  targets: TargetLite[],
  latest: Map<string, SnapshotLite>,
  from: string,
  to: string,
  timeZone: string,
): DailyPoint[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dayOf = (iso: string) => fmt.format(new Date(iso))
  const end = dayOf(to)
  const days: DailyPoint[] = []
  for (
    let d = new Date(`${dayOf(from)}T12:00:00Z`);
    days.length < 400;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const date = d.toISOString().slice(0, 10)
    days.push({ date, posts: 0, reach: 0, engagement: 0 })
    if (date >= end) break
  }
  const index = new Map(days.map((p, i) => [p.date, i]))
  for (const t of targets) {
    const i = index.get(dayOf(t.publishedAt))
    if (i === undefined) continue
    const p = days[i]!
    p.posts += 1
    const s = latest.get(t.targetId)
    if (s) {
      p.reach += s.reach ?? 0
      p.engagement += engagementOfSnapshot(s)
    }
  }
  return days
}
