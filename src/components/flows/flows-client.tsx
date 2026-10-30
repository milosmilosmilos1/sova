'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Pencil, Plus, Search, Trash2, Zap } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { BulkBar, runBulk, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { ErrorBox } from '@/components/shared/error-box'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { RunProgress, type RunView } from './run-progress'

export interface FlowItem {
  id: string
  name: string
  topic: string
  format: 'carousel' | 'single' | 'story'
  slides: number | null
  days: number[]
  effectiveTime: string
  autoTime: boolean
  active: boolean
  nextRunAt: string | null
  lastRun: { status: string; error: string | null; postId: string | null } | null
}

const INTL: Record<string, string> = { 'sr-Latn': 'sr-Latn-RS', en: 'en-GB', uk: 'uk-UA' }

/** Ključ poruke za dan u nedelji (0 = nedelja … 6 = subota). */
export const dayKey = (d: number) => `days.${d as 0 | 1 | 2 | 3 | 4 | 5 | 6}` as const

/** Strana „Automatizuj objave” (D-108): tokovi brenda, sledeći nacrt, uključivanje i „Generiši odmah”. */
export function FlowsClient({
  brandId,
  timeZone,
  canEdit,
  defaultSlides,
}: {
  brandId: string
  timeZone: string
  canEdit: boolean
  defaultSlides: number
}) {
  const t = useTranslations('flows')
  const locale = useLocale()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [search, setSearch] = useState('')
  const [running, setRunning] = useState<{ runId: string; name: string } | null>(null)
  const key = ['flows', brandId]
  const flows = useQuery({
    queryKey: key,
    queryFn: () => api<{ flows: FlowItem[] }>(`/api/flows?brandId=${brandId}`),
  })

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      api<FlowItem>(`/api/flows/${v.id}`, { method: 'PATCH', json: { active: v.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/flows/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const generate = useMutation({
    mutationFn: (f: FlowItem) => api<RunView>(`/api/flows/${f.id}/run`, { method: 'POST' }),
    onSuccess: (run, f) => setRunning({ runId: run.id, name: f.name }),
  })
  // označavanje više tokova (D-119): uključivanje, pauza i brisanje odjednom
  const tb = useTranslations('bulk')
  const bulk = useMutation({
    mutationFn: (v: { ids: string[]; action: 'pause' | 'resume' | 'delete' }) =>
      runBulk(v.ids, (id) =>
        v.action === 'delete'
          ? api(`/api/flows/${id}`, { method: 'DELETE' })
          : api(`/api/flows/${id}`, { method: 'PATCH', json: { active: v.action === 'resume' } }),
      ),
    onSuccess: () => {
      selection.clear()
      return qc.invalidateQueries({ queryKey: key })
    },
  })

  const fmt = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const all = flows.data?.flows ?? []
  const problems = all.filter((f) => f.lastRun?.status === 'failed').length
  const visible = all
    .filter((f) => (filter === 'all' ? true : filter === 'active' ? f.active : !f.active))
    .filter(
      (f) => !search.trim() || `${f.name} ${f.topic}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
  const selection = useSelection(canEdit ? visible.map((f) => f.id) : [])
  const upcoming = all
    .filter((f) => f.active && f.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0]
  const formatLabel = (f: FlowItem) =>
    f.format === 'carousel'
      ? t('format.carousel', { slides: f.slides ?? defaultSlides })
      : t(`format.${f.format}`)
  const schedule = (f: FlowItem) =>
    t('scheduleSummary', {
      days: [...f.days]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => t(dayKey(d)))
        .join(', '),
      time: f.effectiveTime,
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canEdit ? (
          <Button nativeButton={false} render={<Link href="/app/flows/new" />}>
            <Plus aria-hidden />
            {t('new')}
          </Button>
        ) : null}
      </div>

      <ErrorBox error={flows.error ?? toggle.error ?? remove.error ?? generate.error} />

      {flows.data && !all.length ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Layers className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t('empty.title')}</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">{t('empty.text')}</p>
            {canEdit ? (
              <Button nativeButton={false} render={<Link href="/app/flows/new" />}>
                {t('empty.cta')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {all.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="rounded-xl bg-gradient-to-br from-primary to-primary/75 p-5 text-primary-foreground">
            <p className="text-xs font-semibold tracking-wider uppercase opacity-85">{t('next.label')}</p>
            {upcoming ? (
              <>
                <p className="mt-2 text-xl font-semibold">{upcoming.name}</p>
                <p className="mt-1 line-clamp-2 text-sm opacity-90">{upcoming.topic}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/15 px-3 py-1">{formatLabel(upcoming)}</span>
                  <span className="rounded-full bg-white/15 px-3 py-1">{schedule(upcoming)}</span>
                  <span className="rounded-full bg-white/25 px-3 py-1 font-medium">
                    {fmt.format(new Date(upcoming.nextRunAt!))}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm opacity-90">{t('next.none')}</p>
            )}
          </section>
          <section className="grid grid-cols-2 gap-3">
            {(
              [
                ['total', all.length],
                ['active', all.filter((f) => f.active).length],
                ['paused', all.filter((f) => !f.active).length],
                ['problems', problems],
              ] as const
            ).map(([k, n]) => (
              <div
                key={k}
                className={cn(
                  'rounded-xl border bg-card p-4',
                  k === 'problems' && n > 0 && 'border-destructive/50',
                )}
              >
                <p className="text-2xl font-semibold">{n}</p>
                <p className="text-xs text-muted-foreground">{t(`stats.${k}`)}</p>
              </div>
            ))}
          </section>
        </div>
      ) : null}

      {all.length ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={t('title')}>
                {(['all', 'active', 'paused'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm',
                      filter === f
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`filter.${f}`)}
                  </button>
                ))}
              </div>
              <label className="relative w-full sm:w-64">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
                <span className="sr-only">{t('search')}</span>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search')}
                  className="pl-8"
                />
              </label>
            </div>
            {canEdit ? <SelectAllBox selection={selection} /> : null}
            {bulk.data?.failed.length ? (
              <p role="status" className="text-sm text-muted-foreground">
                {tb('resultFailed', { done: bulk.data.done, failed: bulk.data.failed.length })}{' '}
                {bulk.data.failed[0]!.message}
              </p>
            ) : null}
            <ul className="divide-y">
              {visible.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    'grid gap-3 py-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] md:items-center',
                    selection.has(f.id) && 'bg-primary/5',
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit ? <SelectBox selection={selection} id={f.id} label={f.name} /> : null}
                      <p className="font-medium">{f.name}</p>
                      {f.lastRun?.status === 'failed' ? (
                        <Badge variant="destructive">{t('status.failed')}</Badge>
                      ) : (
                        <Badge variant={f.active ? 'default' : 'secondary'}>
                          {t(f.active ? 'status.active' : 'status.paused')}
                        </Badge>
                      )}
                    </div>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{f.topic}</p>
                    {f.lastRun?.status === 'failed' && f.lastRun.error ? (
                      <p className="text-xs text-destructive">
                        {t('lastRunFailed', { error: f.lastRun.error })}
                      </p>
                    ) : null}
                  </div>
                  <Cell label={t('columns.format')} value={formatLabel(f)} />
                  <Cell label={t('columns.schedule')} value={schedule(f)} />
                  <Cell
                    label={t('columns.next')}
                    value={f.active && f.nextRunAt ? fmt.format(new Date(f.nextRunAt)) : t('pausedNext')}
                  />
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Switch
                      checked={f.active}
                      disabled={!canEdit || toggle.isPending}
                      onCheckedChange={(v) => toggle.mutate({ id: f.id, active: Boolean(v) })}
                      aria-label={`${t('actions.toggle')}: ${f.name}`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canEdit || generate.isPending}
                      onClick={() => generate.mutate(f)}
                    >
                      <Zap aria-hidden />
                      {t('actions.generate')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<Link href={`/app/flows/${f.id}`} />}
                    >
                      <Pencil aria-hidden />
                      <span className="sr-only md:not-sr-only">{t('actions.edit')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEdit || remove.isPending}
                      onClick={() => {
                        if (window.confirm(t('actions.confirmDelete', { name: f.name }))) remove.mutate(f.id)
                      }}
                      aria-label={`${t('actions.delete')}: ${f.name}`}
                    >
                      <Trash2 className="text-destructive" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <BulkBar selection={selection}>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending}
          onClick={() => bulk.mutate({ ids: [...selection.selected], action: 'resume' })}
        >
          {tb('resume')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending}
          onClick={() => bulk.mutate({ ids: [...selection.selected], action: 'pause' })}
        >
          {tb('pause')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={bulk.isPending}
          onClick={() =>
            window.confirm(tb('deleteConfirm', { count: selection.count })) &&
            bulk.mutate({ ids: [...selection.selected], action: 'delete' })
          }
        >
          <Trash2 aria-hidden />
          {tb('delete')}
        </Button>
      </BulkBar>

      {running ? (
        <RunProgress
          runId={running.runId}
          flowName={running.name}
          onClose={() => {
            setRunning(null)
            void qc.invalidateQueries({ queryKey: key })
          }}
        />
      ) : null}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}
