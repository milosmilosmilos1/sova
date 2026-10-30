'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, ChevronUp, Lightbulb, Plus } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IDEA_STATUSES, type IdeaStatus } from '@/lib/schemas/ideas'
import { cn } from '@/lib/utils'

interface Idea {
  id: string
  kind: 'idea' | 'bug'
  title: string
  body: string
  status: IdeaStatus
  votes: number
  voted: boolean
  mine: boolean
  createdAt: string
}

const STATUS_TONE: Record<IdeaStatus, string> = {
  new: 'bg-primary/10 text-primary',
  planned: 'bg-sky-100 text-sky-900',
  in_progress: 'bg-amber-100 text-amber-900',
  done: 'bg-emerald-100 text-emerald-900',
  declined: 'bg-muted text-muted-foreground',
}

/**
 * Tabla predloga (D-115): korisnici predlažu funkcije i glasaju (jedan glas po korisniku), prijave
 * problema vide samo autor i tim Sove. Administrator platforme menja status.
 */
export function IdeasClient({
  supportEmail,
  isAdmin,
  openForm,
}: {
  supportEmail: string
  isAdmin: boolean
  openForm: 'idea' | 'bug' | null
}) {
  const t = useTranslations('ideas')
  const format = useFormatter()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [form, setForm] = useState<'idea' | 'bug' | null>(openForm)
  const key = ['ideas', q.trim(), sort]
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api<Idea[]>(`/api/ideas?sort=${sort}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
  })
  const vote = useMutation({
    mutationFn: (id: string) =>
      api<{ voted: boolean; votes: number }>(`/api/ideas/${id}/vote`, { method: 'POST' }),
    onSuccess: (r, id) =>
      qc.setQueryData<Idea[]>(key, (cur) =>
        cur?.map((i) => (i.id === id ? { ...i, voted: r.voted, votes: r.votes } : i)),
      ),
  })
  const status = useMutation({
    mutationFn: (v: { id: string; status: IdeaStatus }) =>
      api(`/api/ideas/${v.id}`, { method: 'PATCH', json: { status: v.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ideas'] }),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="bg-gradient-to-br from-card to-primary/5">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            <p className="text-sm text-muted-foreground">
              {t('emailLead')}{' '}
              <a href={`mailto:${supportEmail}`} className="font-medium text-primary hover:underline">
                {supportEmail}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setForm('idea')}>
              <Plus className="size-4" aria-hidden />
              {t('newIdea')}
            </Button>
            <Button variant="outline" onClick={() => setForm('bug')}>
              <Bug className="size-4" aria-hidden />
              {t('newBug')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          className="sm:w-72"
          maxLength={100}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'new' | 'top')}
          aria-label={t('sortLabel')}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="new">{t('sort.new')}</option>
          <option value="top">{t('sort.top')}</option>
        </select>
      </div>

      <ErrorBox error={query.error ?? vote.error ?? status.error} />

      {query.data && !query.data.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {q.trim() ? t('noResults') : t('empty')}
        </div>
      ) : null}
      {!query.data && !query.error ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : null}

      {query.data?.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {query.data.map((idea) => (
            <li key={idea.id} className="flex gap-4 p-4">
              {idea.kind === 'idea' ? (
                <button
                  type="button"
                  onClick={() => vote.mutate(idea.id)}
                  disabled={vote.isPending}
                  aria-pressed={idea.voted}
                  aria-label={
                    idea.voted ? t('unvote', { title: idea.title }) : t('vote', { title: idea.title })
                  }
                  className={cn(
                    'flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors',
                    idea.voted ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <ChevronUp className="size-4" aria-hidden />
                  {idea.votes}
                </button>
              ) : (
                <span className="grid h-14 w-12 shrink-0 place-items-center rounded-lg border bg-muted/50 text-muted-foreground">
                  <Bug className="size-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium break-words">{idea.title}</p>
                {idea.body ? (
                  <p className="text-sm break-words whitespace-pre-line text-muted-foreground">{idea.body}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_TONE[idea.status])}>
                    {t(`status.${idea.status}`)}
                  </span>
                  {idea.kind === 'bug' ? <Badge variant="outline">{t('bugBadge')}</Badge> : null}
                  {idea.mine ? <Badge variant="secondary">{t('mine')}</Badge> : null}
                  <span>{format.dateTime(new Date(idea.createdAt), { dateStyle: 'medium' })}</span>
                  {isAdmin ? (
                    <select
                      value={idea.status}
                      onChange={(e) => status.mutate({ id: idea.id, status: e.target.value as IdeaStatus })}
                      aria-label={t('statusLabel', { title: idea.title })}
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                    >
                      {IDEA_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {form ? <IdeaForm kind={form} onKind={setForm} onClose={() => setForm(null)} /> : null}
    </div>
  )
}

function IdeaForm({
  kind,
  onKind,
  onClose,
}: {
  kind: 'idea' | 'bug'
  onKind: (k: 'idea' | 'bug') => void
  onClose: () => void
}) {
  const t = useTranslations('ideas.form')
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const save = useMutation({
    mutationFn: () =>
      api('/api/ideas', { method: 'POST', json: { kind, title: title.trim(), body: body.trim() } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ideas'] })
      onClose()
    },
  })
  const option = (active: boolean) =>
    cn(
      'flex flex-1 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors',
      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
    )
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === 'idea' ? t('ideaTitle') : t('bugTitle')}</DialogTitle>
          <DialogDescription>{kind === 'idea' ? t('ideaText') : t('bugText')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="flex gap-2" role="radiogroup" aria-label={t('kind')}>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'idea'}
              className={option(kind === 'idea')}
              onClick={() => onKind('idea')}
            >
              <Lightbulb className="size-4 text-primary" aria-hidden />
              {t('idea')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'bug'}
              className={option(kind === 'bug')}
              onClick={() => onKind('bug')}
            >
              <Bug className="size-4 text-primary" aria-hidden />
              {t('bug')}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-title">{t('titleLabel')}</Label>
            <Input
              id="idea-title"
              value={title}
              maxLength={120}
              placeholder={kind === 'idea' ? t('ideaPlaceholder') : t('bugPlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-body">{t('bodyLabel')}</Label>
            <Textarea
              id="idea-body"
              rows={5}
              value={body}
              maxLength={2000}
              placeholder={kind === 'idea' ? t('ideaBodyPlaceholder') : t('bugBodyPlaceholder')}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {kind === 'bug' ? <p className="text-xs text-muted-foreground">{t('bugPrivate')}</p> : null}
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || title.trim().length < 3}>
              {save.isPending ? t('sending') : t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
