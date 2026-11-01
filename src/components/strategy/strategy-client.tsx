'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Target } from 'lucide-react'
import { useState } from 'react'

import { NetworkName } from '@/components/shared/network-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORMS } from '@/config/platforms'
import { INTL_UI } from '@/i18n/config'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Strategija (faza 10a): lista verzija po periodu, generisanje u pozadini (20 tokena) sa praćenjem
 * posla, pregled ciljeva, mixa mreža, stubova, nedeljnih tema, hashtagova, najboljih vremena
 * (podaci ili pretpostavka), kampanja; aktiviranje; kalendar nacrta iz strategije; stubovi i kampanje.
 */
interface ListItem {
  id: string
  periodStart: string
  periodEnd: string
  weeks: number
  version: number
  status: 'draft' | 'active' | 'archived'
  summary: string | null
  usesAssumptions: boolean
}
interface Pillar {
  id: string
  name: string
  description: string | null
  sharePercent: number | null
  color: string | null
  isActive: boolean
  strategyId: string | null
}
interface Campaign {
  id: string
  name: string
  goal: string | null
  startsOn: string | null
  endsOn: string | null
  keyMessage: string | null
  cta: string | null
}
interface Slot {
  weekday: number
  hour: number
  minute: number
  source: 'data' | 'assumption'
}
interface StrategyView extends ListItem {
  goals: Array<{ goal: string; kpi: string; target: string }>
  networkMix: Partial<Record<keyof typeof PLATFORMS, { per_week: number; formats: string[]; role: string }>>
  weeklyThemes: Array<{ week: number; theme: string; angle: string; pillar: string; campaign: string }>
  hashtagStrategy: { core: string[]; niche: string[]; local: string[]; avoid: string[] }
  bestTimes: Partial<Record<keyof typeof PLATFORMS, Slot[]>>
  assumptions: string[]
  pillars: Pillar[]
  campaigns: Campaign[]
  plannedPosts: number
}
interface Job {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  progress: { message?: string } | null
  output: { strategyId?: string } | null
  errorMessage: string | null
}

/** Kratak naziv dana (0 = nedelja) po jeziku interfejsa; 7. januar 2024. je nedelja. */
const weekdayName = (weekday: number, intl: string) =>
  new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 7 + weekday)),
  )

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

function nextMondayLocal(): string {
  const d = new Date()
  const day = d.getDay()
  const delta = day === 1 ? 7 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateLabel(iso: string, intl: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intl, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ErrorBox({ error }: { error: unknown }) {
  const tc = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : tc('error')}
    </div>
  )
}

export function StrategyClient({
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
  const t = useTranslations('strategy')
  const tg = useTranslations('shell')
  const intl = INTL_UI[useLocale()]
  const fmtDate = (iso: string) => dateLabel(iso, intl)
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const list = useQuery({
    queryKey: ['strategies', brandId],
    queryFn: () => api<{ strategies: ListItem[] }>(`/api/strategies?brandId=${brandId}`),
  })
  const currentId =
    selectedId ??
    list.data?.strategies.find((s) => s.status === 'active')?.id ??
    list.data?.strategies[0]?.id ??
    null
  const detail = useQuery({
    queryKey: ['strategy', currentId],
    queryFn: () => api<StrategyView>(`/api/strategies/${currentId}`),
    enabled: Boolean(currentId),
  })
  const job = useQuery({
    queryKey: ['ai-job', jobId],
    queryFn: () => api<Job>(`/api/ai/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'succeeded' || s === 'failed' || s === 'canceled' ? false : 2000
    },
  })
  if (job.data?.status === 'succeeded' && jobId) {
    const newId = job.data.output?.strategyId ?? null
    setJobId(null)
    void qc.invalidateQueries({ queryKey: ['strategies', brandId] })
    if (newId) setSelectedId(newId)
  }

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['strategies', brandId] })
    void qc.invalidateQueries({ queryKey: ['strategy', currentId] })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{tg('groups.growth')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle', { brand: brandName, timezone })}</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setShowForm((v) => !v)} disabled={Boolean(jobId)}>
            {showForm ? t('close') : t('new')}
          </Button>
        ) : null}
      </div>

      {showForm && canEdit ? (
        <GenerateForm
          brandId={brandId}
          onAccepted={(id) => {
            setJobId(id)
            setShowForm(false)
          }}
        />
      ) : null}

      {jobId ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <span className="inline-block size-2 animate-pulse rounded-full bg-primary" aria-hidden />
            {job.data?.status === 'failed'
              ? t('job.failed', { error: job.data.errorMessage ?? t('job.error') })
              : (job.data?.progress?.message ?? t('job.running'))}
            {job.data?.status === 'failed' ? (
              <Button size="sm" variant="outline" onClick={() => setJobId(null)}>
                {t('job.ok')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {list.data?.strategies.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Target className="size-6" aria-hidden />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">{t('empty')}</p>
            {canEdit && !showForm ? (
              <Button onClick={() => setShowForm(true)} disabled={Boolean(jobId)}>
                {t('new')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t('versions')}</p>
            {list.isPending ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
            <ul className="space-y-1">
              {list.data?.strategies.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50 ${s.id === currentId ? 'border-primary bg-accent/40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                      </span>
                      <Badge variant={s.status === 'active' ? 'default' : 'outline'}>
                        {t(`status.${s.status}`)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('listMeta', { version: s.version, weeks: s.weeks })}
                      {s.usesAssumptions ? ` · ${t('assumptionsTag')}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="space-y-4">
            {detail.isPending && currentId ? (
              <p className="text-sm text-muted-foreground">{t('loadingStrategy')}</p>
            ) : null}
            {detail.isError ? <ErrorBox error={detail.error} /> : null}
            {detail.data ? (
              <StrategyDetail s={detail.data} brandId={brandId} canEdit={canEdit} onChanged={refreshAll} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function GenerateForm({
  brandId,
  onAccepted,
}: {
  brandId: string
  onAccepted: (generationId: string) => void
}) {
  const t = useTranslations('strategy')
  const [periodStart, setPeriodStart] = useState(nextMondayLocal())
  const [weeks, setWeeks] = useState(4)
  const [goals, setGoals] = useState('')
  const [notes, setNotes] = useState('')
  const [postsPerWeek, setPostsPerWeek] = useState('')
  const start = useMutation({
    mutationFn: () =>
      api<{ generationId: string }>('/api/strategies/generate', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: {
          brandId,
          periodStart,
          weeks,
          goals: goals
            .split('\n')
            .map((g) => g.trim())
            .filter(Boolean)
            .slice(0, 5),
          notes: notes.trim() || undefined,
          postsPerWeek: postsPerWeek ? Number(postsPerWeek) : undefined,
        },
      }),
    onSuccess: (d) => onAccepted(d.generationId),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('new')}</CardTitle>
        <CardDescription>{t('form.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="s-start">{t('form.start')}</Label>
            <Input
              id="s-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-weeks">{t('form.duration')}</Label>
            <select
              id="s-weeks"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {[2, 4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {t('form.weeks', { count: w })}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-ppw">{t('form.postsPerWeek')}</Label>
            <Input
              id="s-ppw"
              type="number"
              min={1}
              max={30}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-goals">{t('form.goals')}</Label>
          <Textarea
            id="s-goals"
            rows={3}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder={t('form.goalsPlaceholder')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-notes">{t('form.notes')}</Label>
          <Textarea
            id="s-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
          />
        </div>
        <ErrorBox error={start.error} />
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {t('form.submit')}
        </Button>
      </CardContent>
    </Card>
  )
}

function StrategyDetail({
  s,
  brandId,
  canEdit,
  onChanged,
}: {
  s: StrategyView
  brandId: string
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('strategy')
  const intl = INTL_UI[useLocale()]
  const fmtDate = (iso: string) => dateLabel(iso, intl)
  const [calendarInfo, setCalendarInfo] = useState<string | null>(null)
  const patch = useMutation({
    mutationFn: (json: Record<string, unknown>) =>
      api<StrategyView>(`/api/strategies/${s.id}`, { method: 'PATCH', json }),
    onSuccess: onChanged,
  })
  const calendar = useMutation({
    mutationFn: () =>
      api<{ created: number; skipped: { past: number; duplicate: number; noAccount: number } }>(
        `/api/strategies/${s.id}/generate-calendar`,
        { method: 'POST', json: {} },
      ),
    onSuccess: (r) => {
      const parts = [t('calendar.created', { count: r.created })]
      if (r.skipped.duplicate) parts.push(t('calendar.duplicate', { count: r.skipped.duplicate }))
      if (r.skipped.past) parts.push(t('calendar.past', { count: r.skipped.past }))
      if (r.skipped.noAccount) parts.push(t('calendar.noAccount', { count: r.skipped.noAccount }))
      setCalendarInfo(`${parts.join(', ')}.`)
      onChanged()
    },
  })
  const platforms = Object.keys(s.networkMix) as Array<keyof typeof PLATFORMS>
  const perWeek = platforms.reduce((n, p) => n + (s.networkMix[p]?.per_week ?? 0), 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">
          {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
        </h2>
        <Badge variant={s.status === 'active' ? 'default' : 'outline'}>{t(`status.${s.status}`)}</Badge>
        <span className="text-xs text-muted-foreground">
          {t('detail.meta', { version: s.version, weeks: s.weeks, perWeek, planned: s.plannedPosts })}
        </span>
      </div>
      {s.usesAssumptions ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('detail.assumptions')}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {s.status !== 'active' && s.status !== 'archived' ? (
            <Button size="sm" onClick={() => patch.mutate({ status: 'active' })} disabled={patch.isPending}>
              {t('activate')}
            </Button>
          ) : null}
          {s.status === 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch.mutate({ status: 'draft' })}
              disabled={patch.isPending}
            >
              {t('backToDraft')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch.mutate({ status: 'archived' })}
              disabled={patch.isPending}
            >
              {t('archive')}
            </Button>
          )}
          {s.status !== 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => calendar.mutate()}
              disabled={calendar.isPending}
            >
              {t('makeCalendar', { count: s.weeks * perWeek })}
            </Button>
          ) : null}
          {calendarInfo ? (
            <span className="self-center text-sm text-muted-foreground">
              {calendarInfo}{' '}
              <Link href="/app/calendar" className="underline">
                {t('openCalendar')}
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}
      <ErrorBox error={patch.error ?? calendar.error} />

      {s.summary ? <p className="text-sm">{s.summary}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('goals')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {s.goals.map((g, i) => (
                <li key={i}>
                  <span className="font-medium">{g.goal}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {g.kpi}: {g.target}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('networks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {platforms.map((p) => (
                <li key={p}>
                  <NetworkName platform={p} className="align-middle font-medium" />:{' '}
                  {t('perWeekValue', { count: s.networkMix[p]?.per_week ?? 0 })}
                  {s.networkMix[p]?.formats.length ? ` · ${s.networkMix[p]!.formats.join(', ')}` : ''}
                  {s.networkMix[p]?.role ? (
                    <span className="text-muted-foreground"> · {s.networkMix[p]!.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <PillarsCard brandId={brandId} pillars={s.pillars} canEdit={canEdit} onChanged={onChanged} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('weeklyThemes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">{t('cols.week')}</th>
                <th className="py-1 pr-2">{t('cols.theme')}</th>
                <th className="py-1 pr-2">{t('cols.angle')}</th>
                <th className="py-1 pr-2">{t('cols.pillar')}</th>
                <th className="py-1">{t('cols.campaign')}</th>
              </tr>
            </thead>
            <tbody>
              {s.weeklyThemes.map((w) => (
                <tr key={w.week} className="border-t align-top">
                  <td className="py-1 pr-2">{w.week}</td>
                  <td className="py-1 pr-2 font-medium">{w.theme}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{w.angle}</td>
                  <td className="py-1 pr-2">{w.pillar}</td>
                  <td className="py-1">{w.campaign || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('bestTimes')}</CardTitle>
            <CardDescription>{t('bestTimesHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {platforms.map((p) => (
              <div key={p}>
                <NetworkName platform={p} className="align-middle font-medium" />:{' '}
                {(s.bestTimes[p] ?? []).map((slot, i) => (
                  <Badge key={i} variant={slot.source === 'data' ? 'default' : 'outline'} className="mr-1">
                    {weekdayName(slot.weekday, intl)} {String(slot.hour).padStart(2, '0')}:
                    {String(slot.minute).padStart(2, '0')} ·{' '}
                    {slot.source === 'data' ? t('source.data') : t('source.assumption')}
                  </Badge>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('hashtags.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{t('hashtags.core')}</span>{' '}
              {s.hashtagStrategy.core.join(' ') || '—'}
            </p>
            <p>
              <span className="font-medium">{t('hashtags.niche')}</span>{' '}
              {s.hashtagStrategy.niche.join(' ') || '—'}
            </p>
            <p>
              <span className="font-medium">{t('hashtags.local')}</span>{' '}
              {s.hashtagStrategy.local.join(' ') || '—'}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">{t('hashtags.avoid')}</span>{' '}
              {s.hashtagStrategy.avoid.join(' ') || '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <CampaignsCard
        brandId={brandId}
        strategyId={s.id}
        campaigns={s.campaigns}
        canEdit={canEdit}
        onChanged={onChanged}
      />

      {s.assumptions.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('assumptions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {s.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function PillarsCard({
  brandId,
  pillars,
  canEdit,
  onChanged,
}: {
  brandId: string
  pillars: Pillar[]
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('strategy')
  const [name, setName] = useState('')
  const [share, setShare] = useState('')
  const add = useMutation({
    mutationFn: () =>
      api('/api/pillars', {
        method: 'POST',
        json: { brandId, name: name.trim(), sharePercent: share ? Number(share) : undefined },
      }),
    onSuccess: () => {
      setName('')
      setShare('')
      onChanged()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/pillars/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('pillars.title')}</CardTitle>
        <CardDescription>{t('pillars.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {pillars.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
              title={p.description ?? ''}
            >
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: p.color ?? '#999' }}
                aria-hidden
              />
              {p.name}
              {p.sharePercent !== null ? (
                <span className="text-muted-foreground">{t('percent', { value: p.sharePercent })}</span>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(p.id)}
                  aria-label={t('pillars.delete', { name: p.name })}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!pillars.length ? (
            <span className="text-sm text-muted-foreground">{t('pillars.empty')}</span>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="pillar-name">{t('pillars.new')}</Label>
              <Input
                id="pillar-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder={t('pillars.placeholder')}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="pillar-share">{t('pillars.share')}</Label>
              <Input
                id="pillar-share"
                type="number"
                min={0}
                max={100}
                value={share}
                onChange={(e) => setShare(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => add.mutate()}
              disabled={!name.trim() || add.isPending}
            >
              {t('add')}
            </Button>
          </div>
        ) : null}
        <ErrorBox error={add.error ?? remove.error} />
      </CardContent>
    </Card>
  )
}

function CampaignsCard({
  brandId,
  strategyId,
  campaigns,
  canEdit,
  onChanged,
}: {
  brandId: string
  strategyId: string
  campaigns: Campaign[]
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('strategy')
  const intl = INTL_UI[useLocale()]
  const fmtDate = (iso: string) => dateLabel(iso, intl)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const add = useMutation({
    mutationFn: () =>
      api('/api/campaigns', {
        method: 'POST',
        json: {
          brandId,
          strategyId,
          name: name.trim(),
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
        },
      }),
    onSuccess: () => {
      setName('')
      setStartsOn('')
      setEndsOn('')
      onChanged()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('campaigns.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.startsOn ? fmtDate(c.startsOn) : '—'} – {c.endsOn ? fmtDate(c.endsOn) : '—'}
                  {c.goal ? ` · ${c.goal}` : ''}
                  {c.keyMessage ? ` · ${c.keyMessage}` : ''}
                  {c.cta ? ` · ${c.cta}` : ''}
                </div>
              </div>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(c.id)}
                  disabled={remove.isPending}
                >
                  {t('delete')}
                </Button>
              ) : null}
            </li>
          ))}
          {!campaigns.length ? <li className="text-muted-foreground">{t('campaigns.empty')}</li> : null}
        </ul>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="camp-name">{t('campaigns.new')}</Label>
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-start">{t('campaigns.from')}</Label>
              <Input
                id="camp-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-end">{t('campaigns.to')}</Label>
              <Input id="camp-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => add.mutate()}
              disabled={!name.trim() || add.isPending}
            >
              {t('add')}
            </Button>
          </div>
        ) : null}
        <ErrorBox error={add.error ?? remove.error} />
      </CardContent>
    </Card>
  )
}
