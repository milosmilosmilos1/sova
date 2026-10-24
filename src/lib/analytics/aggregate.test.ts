import { describe, expect, it } from 'vitest'

import {
  followersSeries,
  groupTotals,
  horizonDue,
  latestSnapshots,
  pctDelta,
  periodBefore,
  topTargets,
  totalsOf,
  type SnapshotLite,
  type TargetLite,
} from '@/lib/analytics/aggregate'

const snap = (
  targetId: string,
  horizon: SnapshotLite['horizon'],
  reach: number,
  reactions: number,
  capturedAt = '2026-10-20T10:00:00Z',
): SnapshotLite => ({
  targetId,
  horizon,
  capturedAt,
  impressions: reach + 10,
  reach,
  reactions,
  comments: 1,
  shares: 0,
  saves: 0,
  linkClicks: null,
  engagementRate: null,
})
const target = (
  targetId: string,
  platform: TargetLite['platform'],
  pillarName: string | null,
): TargetLite => ({
  targetId,
  postId: `p-${targetId}`,
  platform,
  socialAccountId: `a-${platform}`,
  publishedAt: '2026-10-19T12:00:00Z',
  permalink: null,
  pillarId: pillarName ? `pil-${pillarName}` : null,
  pillarName,
  title: null,
  excerpt: 'tekst',
})

describe('latestSnapshots', () => {
  it('bira najduži horizont, a pri istom horizontu najsvežiji snimak', () => {
    const latest = latestSnapshots([
      snap('t1', '1h', 50, 5),
      snap('t1', '7d', 300, 20),
      snap('t1', '24h', 200, 10),
      snap('t2', 'adhoc', 10, 1, '2026-10-20T08:00:00Z'),
      snap('t2', 'adhoc', 12, 2, '2026-10-21T08:00:00Z'),
    ])
    expect(latest.get('t1')?.horizon).toBe('7d')
    expect(latest.get('t2')?.reach).toBe(12)
  })
})

describe('zbirovi', () => {
  const targets = [
    target('t1', 'instagram', 'Edukacija'),
    target('t2', 'facebook', 'Ponuda'),
    target('t3', 'facebook', null),
  ]
  const latest = latestSnapshots([snap('t1', '7d', 300, 20), snap('t2', '24h', 100, 4)])
  it('totalsOf broji objave, objave sa metrikama, doseg i stopu angažovanja', () => {
    const t = totalsOf(targets, latest)
    expect(t).toMatchObject({ posts: 3, withMetrics: 2, reach: 400, engagement: 26 })
    expect(t.engagementRate).toBe(0.065)
  })
  it('groupTotals po mreži i po stubu, sortirano po angažovanju', () => {
    const byPlatform = groupTotals(targets, latest, (t) => ({ key: t.platform, label: t.platform }))
    expect(byPlatform.map((r) => r.key)).toEqual(['instagram', 'facebook'])
    expect(byPlatform[1]).toMatchObject({ posts: 2, reach: 100, engagement: 5 })
    const byPillar = groupTotals(targets, latest, (t) =>
      t.pillarId ? { key: t.pillarId, label: t.pillarName! } : null,
    )
    expect(byPillar.map((r) => r.label)).toEqual(['Edukacija', 'Ponuda'])
    expect(topTargets(targets, latest, 1)[0]?.target.targetId).toBe('t1')
  })
  it('pctDelta i prethodni period iste dužine', () => {
    expect(pctDelta(120, 100)).toBe(20)
    expect(pctDelta(80, 100)).toBe(-20)
    expect(pctDelta(5, 0)).toBeNull()
    const prev = periodBefore('2026-10-08T00:00:00.000Z', '2026-10-15T00:00:00.000Z')
    expect(prev.from).toBe('2026-10-01T00:00:00.000Z')
    expect(prev.to).toBe('2026-10-07T23:59:59.999Z')
  })
  it('followersSeries daje prvi, poslednji i razliku po nalogu; horizonDue sabira trajanje', () => {
    const s = followersSeries([
      { accountId: 'a', date: '2026-10-02', followers: 110 },
      { accountId: 'a', date: '2026-10-01', followers: 100 },
      { accountId: 'b', date: '2026-10-01', followers: null },
    ])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ accountId: 'a', first: 100, last: 110, delta: 10 })
    expect(horizonDue('2026-10-19T12:00:00Z', '24h').toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })
})
