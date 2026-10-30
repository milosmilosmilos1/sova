'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Circle,
  FileText,
  Globe,
  NotebookPen,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NOTE_MAX_CHARS } from '@/lib/schemas/setup'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  name: string
  excerpt: string | null
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  createdAt: string
}

interface BrainView {
  active: boolean
  knows: {
    items: Array<{ key: 'name' | 'offer' | 'audience' | 'tone'; value: string | null }>
    filled: number
    source: 'voice' | 'profile' | null
  }
  sources: {
    accounts: number
    posts: number
    site: { url: string | null; analyzedAt: string | null; status: string | null }
    documents: number
    notes: Note[]
    results: number
  }
  playbook: {
    summary: string
    works: string[]
    avoid: string[]
    updatedAt: string | null
    basedOn: { posts: number; from: string; to: string } | null
  } | null
  refresh: { possible: boolean; needed: number }
}

/**
 * Strana Brain (D-113): šta Sova zna o brendu, odakle uči i playbook naučen iz rezultata. Detaljan
 * profil sa sajta i analiza su ispod, na istoj strani (sidro #sajt).
 */
export function BrainClient({
  brandId,
  canEdit,
  emailVerified,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('brain')
  const query = useQuery({
    queryKey: ['brain', brandId],
    queryFn: () => api<BrainView>(`/api/brands/${brandId}/brain`),
    refetchInterval: (q) =>
      q.state.data?.sources.notes.some((n) => n.status === 'processing') ? 2500 : false,
  })
  const view = query.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Brain</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/app/brand" />}>
          {t('editBrand')}
        </Button>
      </div>

      <Hero active={Boolean(view?.active)} hasPlaybook={Boolean(view?.playbook)} />
      <ErrorBox error={query.error} />

      {view ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Knows view={view} />
            <Sources view={view} brandId={brandId} canEdit={canEdit} emailVerified={emailVerified} />
          </div>
          <PlaybookCard view={view} brandId={brandId} canEdit={canEdit} />
        </>
      ) : !query.error ? (
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      ) : null}
    </div>
  )
}

function Hero({ active, hasPlaybook }: { active: boolean; hasPlaybook: boolean }) {
  const t = useTranslations('brain.hero')
  const node = (Icon: LucideIcon, label: string, hint: string) => (
    <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] text-white/70">{hint}</span>
      </span>
    </div>
  )
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-indigo-700 p-6 text-white shadow-sm sm:p-8">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <span
              className={cn('size-2 rounded-full', active ? 'bg-emerald-300' : 'bg-amber-300')}
              aria-hidden
            />
            {active ? t('active') : t('learning')}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t('title')}</h2>
          <p className="max-w-xl text-sm text-white/80">{t('text')}</p>
        </div>
        <div
          className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:justify-end"
          aria-hidden
        >
          <div className="flex flex-col gap-2">
            {node(Share2, t('nodes.sources'), t('nodes.sourcesHint'))}
            {node(BarChart3, t('nodes.results'), t('nodes.resultsHint'))}
          </div>
          <div className="mx-auto h-6 w-px bg-white/30 sm:h-px sm:w-6" />
          <div className="mx-auto grid size-16 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30">
            <Brain className="size-8" />
          </div>
          <div className="mx-auto h-6 w-px bg-white/30 sm:h-px sm:w-6" />
          {node(Sparkles, t('nodes.playbook'), hasPlaybook ? t('nodes.playbookOn') : t('nodes.playbookOff'))}
        </div>
      </div>
    </section>
  )
}

function Knows({ view }: { view: BrainView }) {
  const t = useTranslations('brain.knows')
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('title')}</CardTitle>
            <CardDescription>{t('text')}</CardDescription>
          </div>
          <Badge variant={view.knows.filled === 4 ? 'default' : 'secondary'}>
            {t('filled', { filled: view.knows.filled, total: view.knows.items.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.knows.items.map((item) => (
            <li key={item.key} className="space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`items.${item.key}`)}
                </span>
                {item.value ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-label={t('filledItem')} />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label={t('emptyItem')} />
                )}
              </div>
              <p className={cn('line-clamp-6 text-sm', !item.value && 'text-muted-foreground')}>
                {item.value ?? t('missing')}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {view.knows.source === 'voice'
              ? t('sourceVoice')
              : view.knows.source === 'profile'
                ? t('sourceProfile')
                : t('sourceNone')}
          </span>
          <Link href="/app/brand" className="font-medium text-primary hover:underline">
            {t('edit')} →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function SourceTile({
  icon: Icon,
  title,
  hint,
  on,
  children,
}: {
  icon: LucideIcon
  title: string
  hint: string
  on: boolean
  children?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs break-words text-muted-foreground">{hint}</span>
        </span>
        <span
          className={cn(
            'mt-1 size-2 shrink-0 rounded-full',
            on ? 'bg-emerald-500' : 'bg-muted-foreground/30',
          )}
        />
      </div>
      {children}
    </li>
  )
}

function Sources({
  view,
  brandId,
  canEdit,
  emailVerified,
}: {
  view: BrainView
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('brain.sources')
  const format = useFormatter()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const s = view.sources
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/brands/${brandId}/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain', brandId] }),
  })
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('title')}</CardTitle>
            <CardDescription>{t('text')}</CardDescription>
          </div>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              {t('add')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-3 sm:grid-cols-2">
          <SourceTile
            icon={Share2}
            title={t('networks')}
            hint={s.accounts ? t('networksOn', { accounts: s.accounts, posts: s.posts }) : t('networksOff')}
            on={s.accounts > 0}
          >
            <Link href="/app/accounts" className="text-xs font-medium text-primary hover:underline">
              {s.accounts ? t('manage') : t('connect')} →
            </Link>
          </SourceTile>
          <SourceTile
            icon={Globe}
            title={t('site')}
            hint={
              s.site.analyzedAt
                ? t('siteOn', {
                    url: (s.site.url ?? '').replace(/^https?:\/\//, ''),
                    date: date(s.site.analyzedAt),
                  })
                : s.site.url
                  ? t('siteNotAnalyzed', { url: s.site.url.replace(/^https?:\/\//, '') })
                  : t('siteOff')
            }
            on={Boolean(s.site.analyzedAt)}
          >
            <a href="#sajt" className="text-xs font-medium text-primary hover:underline">
              {s.site.analyzedAt ? t('refreshSite') : t('analyzeSite')} →
            </a>
          </SourceTile>
          <SourceTile
            icon={FileText}
            title={t('documents')}
            hint={s.documents ? t('documentsOn', { count: s.documents }) : t('documentsOff')}
            on={s.documents > 0}
          >
            <Link href="/app/brand" className="text-xs font-medium text-primary hover:underline">
              {t('addPdf')} →
            </Link>
          </SourceTile>
          <SourceTile
            icon={BarChart3}
            title={t('results')}
            hint={s.results ? t('resultsOn', { count: s.results }) : t('resultsOff')}
            on={s.results > 0}
          />
        </ul>

        {s.notes.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('notes')}</h3>
            <ul className="divide-y rounded-lg border">
              {s.notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 p-3 text-sm">
                  <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{n.name}</p>
                    {n.excerpt ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.excerpt}</p>
                    ) : null}
                    <p
                      className={cn(
                        'text-xs',
                        n.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {n.status === 'processing'
                        ? t('noteProcessing')
                        : n.status === 'failed'
                          ? `${t('noteFailed')}${n.error ? `: ${n.error}` : ''}`
                          : t('noteReady', { date: date(n.createdAt) })}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      aria-label={t('deleteNote', { name: n.name })}
                      onClick={() => {
                        if (window.confirm(t('confirmDelete', { name: n.name }))) remove.mutate(n.id)
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ErrorBox error={remove.error} />
      </CardContent>
      {adding ? (
        <AddSourceDialog brandId={brandId} emailVerified={emailVerified} onClose={() => setAdding(false)} />
      ) : null}
    </Card>
  )
}

function AddSourceDialog({
  brandId,
  emailVerified,
  onClose,
}: {
  brandId: string
  emailVerified: boolean
  onClose: () => void
}) {
  const t = useTranslations('brain.addSource')
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const save = useMutation({
    mutationFn: () =>
      api(`/api/brands/${brandId}/notes`, {
        method: 'POST',
        json: { title: title.trim(), content: content.trim() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['brain', brandId] })
      onClose()
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('text')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/app/brand"
            className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
          >
            <FileText className="size-4 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">{t('pdf')}</span>
              <span className="block text-xs text-muted-foreground">{t('pdfHint')}</span>
            </span>
          </Link>
          <a
            href="#sajt"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
          >
            <Globe className="size-4 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">{t('site')}</span>
              <span className="block text-xs text-muted-foreground">{t('siteHint')}</span>
            </span>
          </a>
        </div>
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <p className="text-sm font-medium">{t('note')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="note-title">{t('noteTitle')}</Label>
            <Input
              id="note-title"
              value={title}
              maxLength={120}
              placeholder={t('noteTitlePlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="note-content">{t('noteContent')}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {content.length}/{NOTE_MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="note-content"
              rows={6}
              value={content}
              maxLength={NOTE_MAX_CHARS}
              placeholder={t('noteContentPlaceholder')}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {!emailVerified ? <p className="text-sm text-muted-foreground">{t('verifyEmail')}</p> : null}
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!emailVerified || save.isPending || !title.trim() || !content.trim()}
            >
              {save.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlaybookCard({ view, brandId, canEdit }: { view: BrainView; brandId: string; canEdit: boolean }) {
  const t = useTranslations('brain.playbook')
  const format = useFormatter()
  const qc = useQueryClient()
  const pb = view.playbook
  const refresh = useMutation({
    mutationFn: async () => {
      const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      const r = await api<{ status: string; reason?: string }>('/api/analytics/insights/generate', {
        method: 'POST',
        json: { brandId, periodStart: from },
      })
      // uvidi bez dovoljno objava ili sa greškom modela vraćaju 200 sa razlogom
      if (r.status !== 'created') throw new Error(r.reason ?? t('refreshFailed'))
      return r
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain', brandId] }),
  })
  const list = (items: string[], empty: string, tone: 'good' | 'bad') =>
    items.length ? (
      <ul className="space-y-2">
        {items.map((x) => (
          <li key={x} className="flex gap-2 text-sm">
            <span
              className={cn(
                'mt-1.5 size-1.5 shrink-0 rounded-full',
                tone === 'good' ? 'bg-emerald-500' : 'bg-rose-500',
              )}
              aria-hidden
            />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{empty}</p>
    )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('title')}</CardTitle>
            <CardDescription>{t('text')}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t('auto')}</Badge>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!view.refresh.possible || refresh.isPending}
                onClick={() => refresh.mutate()}
                title={view.refresh.possible ? undefined : t('refreshNeeds', { count: view.refresh.needed })}
              >
                <RefreshCw className={cn('size-4', refresh.isPending && 'animate-spin')} aria-hidden />
                {refresh.isPending ? t('refreshing') : t('refresh')}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBox error={refresh.error} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-xl bg-gradient-to-br from-primary to-indigo-700 p-4 text-white">
            <p className="text-xs font-semibold tracking-wider text-white/80 uppercase">{t('summary')}</p>
            <p className="text-sm">{pb?.summary || t('summaryEmpty')}</p>
            {pb?.updatedAt ? (
              <p className="text-xs text-white/70">
                {t('updated', {
                  date: format.dateTime(new Date(pb.updatedAt), { dateStyle: 'medium' }),
                  posts: pb.basedOn?.posts ?? 0,
                })}
              </p>
            ) : (
              <p className="text-xs text-white/70">
                {view.refresh.possible ? t('readyToLearn') : t('needs', { count: view.refresh.needed })}
              </p>
            )}
          </div>
          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('works')}</p>
            {list(pb?.works ?? [], t('worksEmpty'), 'good')}
          </div>
          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">{t('avoid')}</p>
            {list(pb?.avoid ?? [], t('avoidEmpty'), 'bad')}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
