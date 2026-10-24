'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORMS } from '@/config/platforms'
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

const STATUS_LABEL: Record<ListItem['status'], string> = {
  draft: 'nacrt',
  active: 'aktivna',
  archived: 'arhivirana',
}
const WEEKDAY = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub']

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

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('sr-Latn-RS', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
          <h1 className="text-2xl font-semibold tracking-tight">Strategija</h1>
          <p className="text-sm text-muted-foreground">
            {brandName} · zona {timezone}. AI pravi plan za period; vi ga doterujete, aktivirate i pretvarate
            u kalendar.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setShowForm((v) => !v)} disabled={Boolean(jobId)}>
            {showForm ? 'Zatvori' : 'Nova strategija'}
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
              ? `Generisanje nije uspelo: ${job.data.errorMessage ?? 'greška'}. Tokeni su vraćeni.`
              : (job.data?.progress?.message ?? 'Strategija se pravi (do 2 minuta)…')}
            {job.data?.status === 'failed' ? (
              <Button size="sm" variant="outline" onClick={() => setJobId(null)}>
                U redu
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">Verzije</p>
          {list.isPending ? <p className="text-sm text-muted-foreground">Učitavam…</p> : null}
          {list.data?.strategies.length === 0 ? (
            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              Još nema strategije. Kliknite „Nova strategija” — treba vam bar jedna povezana mreža ili izbor
              mreža.
            </p>
          ) : null}
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
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    v{s.version} · {s.weeks} ned.{s.usesAssumptions ? ' · pretpostavke' : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-4">
          {detail.isPending && currentId ? (
            <p className="text-sm text-muted-foreground">Učitavam strategiju…</p>
          ) : null}
          {detail.isError ? <ErrorBox error={detail.error} /> : null}
          {detail.data ? (
            <StrategyDetail s={detail.data} brandId={brandId} canEdit={canEdit} onChanged={refreshAll} />
          ) : null}
        </div>
      </div>
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
        <CardTitle className="text-base">Nova strategija</CardTitle>
        <CardDescription>
          20 tokena. Koristi profil brenda, uvezenu istoriju objava (kad je ima), praznike i vaše ciljeve.
          Mreže: aktivni nalozi brenda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="s-start">Početak perioda</Label>
            <Input
              id="s-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-weeks">Trajanje</Label>
            <select
              id="s-weeks"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {[2, 4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w} nedelja
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-ppw">Objava nedeljno (opciono)</Label>
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
          <Label htmlFor="s-goals">Ciljevi (jedan po redu, do 5)</Label>
          <Textarea
            id="s-goals"
            rows={3}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Više upita za servis&#10;Prepoznatljivost u Beogradu"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-notes">Napomene (opciono)</Label>
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
          Generiši strategiju
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
      setCalendarInfo(
        `Napravljeno ${r.created} nacrta` +
          (r.skipped.duplicate ? `, ${r.skipped.duplicate} već postoji` : '') +
          (r.skipped.past ? `, ${r.skipped.past} u prošlosti` : '') +
          (r.skipped.noAccount ? `, ${r.skipped.noAccount} bez naloga za mrežu` : '') +
          '.',
      )
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
        <Badge variant={s.status === 'active' ? 'default' : 'outline'}>{STATUS_LABEL[s.status]}</Badge>
        <span className="text-xs text-muted-foreground">
          verzija {s.version} · {s.weeks} nedelja · {perWeek} objava nedeljno · {s.plannedPosts} nacrta iz
          strategije
        </span>
      </div>
      {s.usesAssumptions ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Deo plana su pretpostavke (nema dovoljno istorije objava). Vremena označena „pretpostavka” proverite
          posle prvih nedelja.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {s.status !== 'active' && s.status !== 'archived' ? (
            <Button size="sm" onClick={() => patch.mutate({ status: 'active' })} disabled={patch.isPending}>
              Aktiviraj
            </Button>
          ) : null}
          {s.status === 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch.mutate({ status: 'draft' })}
              disabled={patch.isPending}
            >
              Vrati u nacrt
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch.mutate({ status: 'archived' })}
              disabled={patch.isPending}
            >
              Arhiviraj
            </Button>
          )}
          {s.status !== 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => calendar.mutate()}
              disabled={calendar.isPending}
            >
              Napravi kalendar ({s.weeks * perWeek} nacrta)
            </Button>
          ) : null}
          {calendarInfo ? (
            <span className="self-center text-sm text-muted-foreground">
              {calendarInfo}{' '}
              <Link href="/app/calendar" className="underline">
                Otvori kalendar
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
            <CardTitle className="text-base">Ciljevi</CardTitle>
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
            <CardTitle className="text-base">Mreže</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {platforms.map((p) => (
                <li key={p}>
                  <span className="font-medium">{PLATFORMS[p].label}</span>: {s.networkMix[p]?.per_week}{' '}
                  nedeljno
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
          <CardTitle className="text-base">Nedeljne teme</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Ned.</th>
                <th className="py-1 pr-2">Tema</th>
                <th className="py-1 pr-2">Ugao</th>
                <th className="py-1 pr-2">Stub</th>
                <th className="py-1">Kampanja</th>
              </tr>
            </thead>
            <tbody>
              {s.weeklyThemes.map((t) => (
                <tr key={t.week} className="border-t align-top">
                  <td className="py-1 pr-2">{t.week}</td>
                  <td className="py-1 pr-2 font-medium">{t.theme}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{t.angle}</td>
                  <td className="py-1 pr-2">{t.pillar}</td>
                  <td className="py-1">{t.campaign || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Najbolja vremena</CardTitle>
            <CardDescription>
              Lokalno vreme brenda. „podaci” = iz istorije objava, „pretpostavka” = dok ne stignu podaci.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {platforms.map((p) => (
              <div key={p}>
                <span className="font-medium">{PLATFORMS[p].label}:</span>{' '}
                {(s.bestTimes[p] ?? []).map((slot, i) => (
                  <Badge key={i} variant={slot.source === 'data' ? 'default' : 'outline'} className="mr-1">
                    {WEEKDAY[slot.weekday]} {String(slot.hour).padStart(2, '0')}:
                    {String(slot.minute).padStart(2, '0')} ·{' '}
                    {slot.source === 'data' ? 'podaci' : 'pretpostavka'}
                  </Badge>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hashtagovi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Stalni:</span> {s.hashtagStrategy.core.join(' ') || '—'}
            </p>
            <p>
              <span className="font-medium">Tematski:</span> {s.hashtagStrategy.niche.join(' ') || '—'}
            </p>
            <p>
              <span className="font-medium">Lokalni:</span> {s.hashtagStrategy.local.join(' ') || '—'}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Izbegavati:</span> {s.hashtagStrategy.avoid.join(' ') || '—'}
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
            <CardTitle className="text-base">Pretpostavke</CardTitle>
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
        <CardTitle className="text-base">Stubovi sadržaja</CardTitle>
        <CardDescription>Udeo govori koliko objava u periodu pripada stubu.</CardDescription>
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
                <span className="text-muted-foreground">{p.sharePercent} %</span>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(p.id)}
                  aria-label={`Obriši stub ${p.name}`}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!pillars.length ? <span className="text-sm text-muted-foreground">Još nema stubova.</span> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="pillar-name">Nov stub</Label>
              <Input
                id="pillar-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="npr. Edukacija"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="pillar-share">Udeo %</Label>
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
              Dodaj
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
        <CardTitle className="text-base">Kampanje</CardTitle>
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
                  Obriši
                </Button>
              ) : null}
            </li>
          ))}
          {!campaigns.length ? (
            <li className="text-muted-foreground">Nema kampanja u ovom periodu.</li>
          ) : null}
        </ul>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="camp-name">Nova kampanja</Label>
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-start">Od</Label>
              <Input
                id="camp-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-end">Do</Label>
              <Input id="camp-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => add.mutate()}
              disabled={!name.trim() || add.isPending}
            >
              Dodaj
            </Button>
          </div>
        ) : null}
        <ErrorBox error={add.error ?? remove.error} />
      </CardContent>
    </Card>
  )
}
