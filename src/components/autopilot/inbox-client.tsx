'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { BulkBar, runBulk, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { INTL_UI } from '@/i18n/config'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Inbox predloga (brif 9.3): predlozi iz bloga, promena sajta, praznika, analitike i AI uvida.
 * „Prihvati” pravi nacrt (ili vodi na Brand Brain / strategiju), „Odbaci” ga sklanja.
 */
type Status = 'new' | 'accepted' | 'dismissed' | 'expired'
interface Suggestion {
  id: string
  source: 'blog' | 'site_change' | 'holiday' | 'analytics' | 'insight' | 'evergreen' | 'manual'
  kind: string
  title: string
  body: string | null
  payload: Record<string, unknown>
  evidence: Record<string, unknown> | null
  score: number | null
  status: Status
  expiresAt: string | null
  acceptedPostId: string | null
  createdAt: string
}

const TABS: Status[] = ['new', 'accepted', 'dismissed', 'expired']

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

export function InboxClient({
  brandId,
  brandName,
  canEdit,
  embedded = false,
}: {
  brandId: string
  brandName: string
  canEdit: boolean
  /** kartica „Predlozi” u Inbox-u (D-117): bez naslova strane */
  embedded?: boolean
}) {
  const t = useTranslations('suggestions')
  const intl = INTL_UI[useLocale()]
  const qc = useQueryClient()
  const router = useRouter()
  const [status, setStatus] = useState<Status>('new')
  const list = useQuery({
    queryKey: ['suggestions', brandId, status],
    queryFn: () =>
      api<{ items: Suggestion[]; counts: Record<Status, number> }>(
        `/api/suggestions?brandId=${brandId}&status=${status}`,
      ),
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['suggestions', brandId] })
  const accept = useMutation({
    mutationFn: (id: string) =>
      api<{ redirect: string }>(`/api/suggestions/${id}/accept`, { method: 'POST', json: {} }),
    onSuccess: (r) => {
      refresh()
      router.push(r.redirect as Route)
    },
  })
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/api/suggestions/${id}/dismiss`, { method: 'POST', json: {} }),
    onSuccess: refresh,
  })
  const counts = list.data?.counts
  // označavanje više predloga (D-119): odbacivanje svih označenih odjednom
  const tb = useTranslations('bulk')
  const open = (list.data?.items ?? []).filter((s) => s.status === 'new')
  const selection = useSelection(canEdit ? open.map((s) => s.id) : [])
  const bulkDismiss = useMutation({
    mutationFn: (ids: string[]) =>
      runBulk(ids, async (id) => {
        const res = await fetch(`/api/suggestions/${id}/dismiss`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        const data = (await res.json()) as ApiResponse<unknown>
        if (!data.ok) throw new Error(data.error.message)
      }),
    onSuccess: () => {
      selection.clear()
      refresh()
    },
  })

  return (
    <div className={embedded ? 'max-w-3xl space-y-6' : 'mx-auto max-w-3xl space-y-6'}>
      <div>
        {embedded ? (
          <h2 className="text-lg font-semibold">{t('embeddedTitle')}</h2>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        )}
        <p className="text-sm text-muted-foreground">{t('subtitle', { brand: brandName })}</p>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('statusLabel')}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => setStatus(tab)}
            className={`rounded-md px-3 py-1.5 text-sm ${status === tab ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
          >
            {t(`tabs.${tab}`)}
            {counts ? <span className="ml-1 text-muted-foreground tabular-nums">{counts[tab]}</span> : null}
          </button>
        ))}
      </div>
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {accept.error || dismiss.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(accept.error ?? dismiss.error)?.message}
        </p>
      ) : null}
      {list.isPending ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      {list.data && !list.data.items.length ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {status === 'new' ? t('emptyNew') : t('empty')}
        </p>
      ) : null}
      {open.length && canEdit ? <SelectAllBox selection={selection} /> : null}
      <ul className="space-y-3">
        {list.data?.items.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            {s.status === 'new' && canEdit ? (
              <SelectBox selection={selection} id={s.id} label={s.title} className="mt-5" />
            ) : null}
            <Card className={`min-w-0 flex-1 ${selection.has(s.id) ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`source.${s.source}`)}</Badge>
                  {s.score !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t('score', { score: Math.round(s.score) })}
                    </span>
                  ) : null}
                  {s.expiresAt && s.status === 'new' ? (
                    <span className="text-xs text-muted-foreground">
                      {t('validUntil', {
                        date: new Date(s.expiresAt).toLocaleDateString(intl, {
                          day: 'numeric',
                          month: 'short',
                        }),
                      })}
                    </span>
                  ) : null}
                </div>
                <p className="font-medium">{s.title}</p>
                {s.body ? <p className="text-sm text-muted-foreground">{s.body}</p> : null}
                {typeof s.payload.url === 'string' ? (
                  <a href={s.payload.url} target="_blank" rel="noreferrer" className="text-xs underline">
                    {s.payload.url}
                  </a>
                ) : null}
                {s.status === 'new' && canEdit ? (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => accept.mutate(s.id)} disabled={accept.isPending}>
                      {t('accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss.mutate(s.id)}
                      disabled={dismiss.isPending}
                    >
                      {t('dismiss')}
                    </Button>
                  </div>
                ) : null}
                {s.status === 'accepted' && s.acceptedPostId ? (
                  <a href={`/app/posts/${s.acceptedPostId}`} className="text-sm underline">
                    {t('openDraft')}
                  </a>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {bulkDismiss.data?.failed.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          {tb('resultFailed', { done: bulkDismiss.data.done, failed: bulkDismiss.data.failed.length })}
        </p>
      ) : null}
      <BulkBar selection={selection}>
        <Button
          size="sm"
          variant="outline"
          disabled={bulkDismiss.isPending}
          onClick={() => bulkDismiss.mutate([...selection.selected])}
        >
          {tb('dismiss')}
        </Button>
      </BulkBar>
    </div>
  )
}
