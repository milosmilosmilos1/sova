'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ColumnChart, type ColumnBar } from '@/components/charts/column-chart'
import { dayLabel } from '@/components/charts/scale'
import { TrendChart } from '@/components/charts/trend-chart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS } from '@/config/platforms'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Analitika (faza 10b): period 7/30/90 dana, četiri ključna broja sa promenom u odnosu na prethodni
 * period, tabele po mreži i stubu, najbolje objave, pratioci po nalogu, sve objave sa metrikama,
 * AI uvidi sa dokazima. Trend po danu i pratioci po nalogu su grafikoni jedne serije (mali višestruki
 * grafikoni umesto više boja), uvek uz tabelu (D-092).
 */
interface Totals {
  posts: number
  withMetrics: number
  impressions: number
  reach: number
  engagement: number
  engagementRate: number | null
}
interface GroupRow {
  key: string
  label: string
  posts: number
  reach: number
  engagement: number
  engagementRate: number | null
}
interface PostRow {
  targetId: string
  postId: string
  platform: keyof typeof PLATFORMS
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
  horizon: string
  horizonsCaptured?: string[]
  reactions?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
}
interface Overview {
  from: string
  to: string
  timezone: string
  totals: Totals
  previous: Totals
  deltas: {
    posts: number | null
    reach: number | null
    engagement: number | null
    engagementRate: number | null
  }
  perPlatform: Array<GroupRow & { platformLabel: string }>
  perPillar: GroupRow[]
  topPosts: PostRow[]
  followers: Array<{
    accountId: string
    name: string | null
    platform: keyof typeof PLATFORMS | null
    first: number | null
    last: number | null
    delta: number | null
    points: Array<{ date: string; followers: number }>
  }>
  daily: Array<{ date: string; posts: number; reach: number; engagement: number }>
  notes: string[]
}
type DailyRow = Overview['daily'][number]

const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('sr-Latn-RS', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** Do mesec dana po danu, duže po nedelji od ponedeljka (90 stubova se ne čita). */
function columnBars(daily: DailyRow[], pick: (d: DailyRow) => number): ColumnBar[] {
  if (daily.length <= 31)
    return daily.map((d) => ({
      key: d.date,
      label: dayLabel(d.date),
      longLabel: longDay(d.date),
      value: pick(d),
    }))
  const weeks = new Map<string, ColumnBar>()
  for (const d of daily) {
    const day = new Date(`${d.date}T12:00:00Z`)
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const bar = weeks.get(monday) ?? {
      key: monday,
      label: dayLabel(monday),
      longLabel: `nedelja od ${dayLabel(monday)}`,
      value: 0,
    }
    bar.value += pick(d)
    weeks.set(monday, bar)
  }
  return [...weeks.values()]
}

interface Insight {
  id: string
  periodStart: string
  periodEnd: string
  createdAt: string
  items: Array<{
    claim: string
    recommendation: string
    evidenceTargetIds: string[]
    confidence: number
    suggestionKind: string
    suggestionTitle: string
  }>
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

const fmtN = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('sr-Latn-RS')
const fmtRate = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : `${(v * 100).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })} %`
const fmtDelta = (v: number | null) =>
  v === null
    ? 'bez poređenja'
    : `${v > 0 ? '+' : ''}${v.toLocaleString('sr-Latn-RS')} % u odnosu na prethodni period`
const fmtDate = (iso: string, tz: string) =>
  new Date(iso).toLocaleDateString('sr-Latn-RS', { timeZone: tz, day: 'numeric', month: 'short' })

function rangeFor(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : 'Greška.'}
    </div>
  )
}

function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string
  value: string
  delta: number | null
  hint?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <span className={delta === null ? '' : delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
          {fmtDelta(delta)}
        </span>
        {hint ? <div>{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

export function AnalyticsClient({
  brandId,
  brandName,
  timezone,
  canEdit,
}: {
  brandId: string
  brandName: string
  timezone: string
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [days, setDays] = useState(30)
  const range = rangeFor(days)
  const q = `brandId=${brandId}&from=${range.from}&to=${range.to}`
  const overview = useQuery({
    queryKey: ['analytics-overview', brandId, days],
    queryFn: () => api<Overview>(`/api/analytics/overview?${q}`),
    // pri promeni perioda prethodni prikaz ostaje (prigušen) dok stižu novi brojevi
    placeholderData: (prev) => prev,
  })
  const posts = useQuery({
    queryKey: ['analytics-posts', brandId, days],
    queryFn: () => api<{ items: PostRow[] }>(`/api/analytics/posts?${q}&limit=100`),
  })
  const insights = useQuery({
    queryKey: ['insights', brandId],
    queryFn: () => api<{ insights: Insight[] }>(`/api/analytics/insights?brandId=${brandId}&limit=5`),
  })
  const generate = useMutation({
    mutationFn: () =>
      api<{ status: string; reason?: string; items?: number }>('/api/analytics/insights/generate', {
        method: 'POST',
        json: { brandId },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insights', brandId] }),
  })
  const refresh = useMutation({
    mutationFn: (targetId: string) =>
      api<{ status: string; reason?: string }>('/api/analytics/refresh', {
        method: 'POST',
        json: { targetId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['analytics-overview', brandId] })
      void qc.invalidateQueries({ queryKey: ['analytics-posts', brandId] })
    },
  })
  const o = overview.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analitika</h1>
          <p className="text-sm text-muted-foreground">
            {brandName} · zona {timezone}. Metrike objava stižu 1 h, 24 h, 7 i 30 dana posle objave; metrike
            naloga svakog jutra.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={`rounded px-3 py-1 text-sm ${days === d ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
              >
                {d} dana
              </button>
            ))}
          </div>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'Analiziram…' : 'Generiši uvide'}
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorBox error={overview.error ?? generate.error ?? refresh.error} />
      {generate.data && generate.data.status !== 'created' ? (
        <p className="text-sm text-muted-foreground">{generate.data.reason ?? 'Uvidi nisu napravljeni.'}</p>
      ) : null}

      {o ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Objavljeno"
              value={fmtN(o.totals.posts)}
              delta={o.deltas.posts}
              hint={
                o.totals.withMetrics < o.totals.posts ? `${o.totals.withMetrics} sa metrikama` : undefined
              }
            />
            <StatTile label="Doseg" value={fmtN(o.totals.reach)} delta={o.deltas.reach} />
            <StatTile
              label="Angažovanje"
              value={fmtN(o.totals.engagement)}
              delta={o.deltas.engagement}
              hint="reakcije + komentari + deljenja + čuvanja"
            />
            <StatTile
              label="Stopa angažovanja"
              value={fmtRate(o.totals.engagementRate)}
              delta={o.deltas.engagementRate}
              hint="angažovanje / doseg"
            />
          </div>
          {o.notes.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {o.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Doseg i angažovanje po danu objave</CardTitle>
              <CardDescription>
                Svaka objava se računa na dan kad je izašla, sa poslednjim snimkom metrika ({o.timezone}).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-8 lg:grid-cols-2">
              <ColumnChart
                title={o.daily.length > 31 ? 'Doseg po nedelji' : 'Doseg po danu'}
                bars={columnBars(o.daily, (d) => d.reach)}
                dim={overview.isPlaceholderData}
              />
              <ColumnChart
                title={o.daily.length > 31 ? 'Angažovanje po nedelji' : 'Angažovanje po danu'}
                description="reakcije + komentari + deljenja + čuvanja"
                bars={columnBars(o.daily, (d) => d.engagement)}
                dim={overview.isPlaceholderData}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Po mreži</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable rows={o.perPlatform} empty="Nema objavljenih objava u periodu." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Po stubu sadržaja</CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable
                  rows={o.perPillar}
                  empty="Objave u periodu nemaju dodeljen stub (dodelite ga u strategiji ili pri izradi)."
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Najbolje objave</CardTitle>
              <CardDescription>Po angažovanju iz merodavnog snimka (najduži horizont).</CardDescription>
            </CardHeader>
            <CardContent>
              <PostsTable
                rows={o.topPosts}
                timezone={timezone}
                canEdit={canEdit}
                onRefresh={(id) => refresh.mutate(id)}
                busy={refresh.isPending}
                compact
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pratioci</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {o.followers.some((f) => f.points.length > 1) ? (
                <div className="grid gap-8 md:grid-cols-2">
                  {o.followers
                    .filter((f) => f.points.length > 1)
                    .map((f) => (
                      <TrendChart
                        key={f.accountId}
                        title={f.name ?? 'Nalog'}
                        description={f.platform ? PLATFORMS[f.platform].label : undefined}
                        points={f.points.map((p) => ({ date: p.date, value: p.followers }))}
                        zeroBaseline={false}
                        dim={overview.isPlaceholderData}
                      />
                    ))}
                </div>
              ) : null}
              {o.followers.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Nalog</th>
                      <th className="py-1 pr-2 text-right">Početak</th>
                      <th className="py-1 pr-2 text-right">Kraj</th>
                      <th className="py-1 text-right">Promena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.followers.map((f) => (
                      <tr key={f.accountId} className="border-t">
                        <td className="py-1 pr-2">
                          {f.name ?? f.accountId}
                          {f.platform ? (
                            <span className="text-muted-foreground"> · {PLATFORMS[f.platform].label}</span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{fmtN(f.first)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{fmtN(f.last)}</td>
                        <td
                          className={`py-1 text-right tabular-nums ${f.delta !== null && f.delta < 0 ? 'text-rose-700' : f.delta ? 'text-emerald-700' : ''}`}
                        >
                          {f.delta === null ? '—' : `${f.delta > 0 ? '+' : ''}${fmtN(f.delta)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Još nema dnevnih metrika naloga za ovaj period.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : overview.isPending ? (
        <p className="text-sm text-muted-foreground">Učitavam…</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI uvidi</CardTitle>
          <CardDescription>
            Nedeljno automatski (nedeljom uveče) ili na zahtev; svaki uvid navodi objave na kojima se zasniva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {insights.data?.insights.length ? (
            insights.data.insights.map((ins) => (
              <div key={ins.id} className="rounded-md border p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Period {ins.periodStart} – {ins.periodEnd}
                </p>
                <ul className="space-y-2 text-sm">
                  {ins.items.map((it, i) => (
                    <li key={i}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{it.claim}</span>
                        <Badge variant="outline">pouzdanost {Math.round(it.confidence * 100)} %</Badge>
                        {it.evidenceTargetIds.length ? (
                          <Badge variant="secondary">{it.evidenceTargetIds.length} objava kao dokaz</Badge>
                        ) : null}
                        {it.suggestionKind ? (
                          <Badge>predlog: {it.suggestionTitle || it.suggestionKind}</Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground">{it.recommendation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Još nema uvida. Treba bar 3 objave sa metrikama u periodu.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sve objave u periodu</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.data ? (
            <PostsTable
              rows={posts.data.items}
              timezone={timezone}
              canEdit={canEdit}
              onRefresh={(id) => refresh.mutate(id)}
              busy={refresh.isPending}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Učitavam…</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GroupTable({ rows, empty }: { rows: GroupRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-2">&nbsp;</th>
          <th className="py-1 pr-2 text-right">Objave</th>
          <th className="py-1 pr-2 text-right">Doseg</th>
          <th className="py-1 pr-2 text-right">Angažovanje</th>
          <th className="py-1 text-right">Stopa</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t">
            <td className="py-1 pr-2 font-medium">{r.label}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{fmtN(r.posts)}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{fmtN(r.reach)}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{fmtN(r.engagement)}</td>
            <td className="py-1 text-right tabular-nums">{fmtRate(r.engagementRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PostsTable({
  rows,
  timezone,
  canEdit,
  onRefresh,
  busy,
  compact,
}: {
  rows: PostRow[]
  timezone: string
  canEdit: boolean
  onRefresh: (targetId: string) => void
  busy: boolean
  compact?: boolean
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nema objava sa metrikama u periodu.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">Datum</th>
            <th className="py-1 pr-2">Mreža</th>
            <th className="py-1 pr-2">Objava</th>
            <th className="py-1 pr-2 text-right">Doseg</th>
            <th className="py-1 pr-2 text-right">Angažovanje</th>
            {!compact ? <th className="py-1 pr-2 text-right">Reakcije / kom. / delj. / čuv.</th> : null}
            <th className="py-1 pr-2">Snimak</th>
            <th className="py-1">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.targetId} className="border-t align-top">
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(p.publishedAt, timezone)}</td>
              <td className="py-1 pr-2 whitespace-nowrap">
                {PLATFORMS[p.platform].label}
                {p.accountName ? <span className="text-muted-foreground"> · {p.accountName}</span> : null}
              </td>
              <td className="py-1 pr-2">
                <a href={`/app/posts/${p.postId}`} className="underline-offset-2 hover:underline">
                  {p.title ?? p.excerpt ?? '—'}
                </a>
                {p.pillarName ? (
                  <span className="ml-1 text-xs text-muted-foreground">· {p.pillarName}</span>
                ) : null}
                {p.permalink ? (
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="ml-1 text-xs underline">
                    na mreži
                  </a>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtN(p.reach)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtN(p.engagement)}</td>
              {!compact ? (
                <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums">
                  {fmtN(p.reactions)} / {fmtN(p.comments)} / {fmtN(p.shares)} / {fmtN(p.saves)}
                </td>
              ) : null}
              <td className="py-1 pr-2 text-xs whitespace-nowrap text-muted-foreground">
                {p.horizonsCaptured?.length ? p.horizonsCaptured.join(', ') : p.horizon}
              </td>
              <td className="py-1">
                {canEdit ? (
                  <Button size="sm" variant="ghost" onClick={() => onRefresh(p.targetId)} disabled={busy}>
                    Osveži
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
