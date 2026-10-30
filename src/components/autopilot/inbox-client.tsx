'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

const SOURCE: Record<Suggestion['source'], string> = {
  blog: 'Blog',
  site_change: 'Promena sajta',
  holiday: 'Praznik',
  analytics: 'Analitika',
  insight: 'AI uvid',
  evergreen: 'Evergreen',
  manual: 'Ručno',
}
const TABS: Array<{ key: Status; label: string }> = [
  { key: 'new', label: 'Novi' },
  { key: 'accepted', label: 'Prihvaćeni' },
  { key: 'dismissed', label: 'Odbačeni' },
  { key: 'expired', label: 'Istekli' },
]

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

  return (
    <div className={embedded ? 'max-w-3xl space-y-6' : 'mx-auto max-w-3xl space-y-6'}>
      <div>
        {embedded ? (
          <h2 className="text-lg font-semibold">Predlozi sadržaja</h2>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">Inbox predloga</h1>
        )}
        <p className="text-sm text-muted-foreground">
          {brandName}: ideje iz bloga, promena na sajtu, praznika i rezultata. Prihvatanjem nastaje nacrt koji
          doterujete pre objave.
        </p>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Status predloga">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${status === t.key ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
          >
            {t.label}
            {counts ? <span className="ml-1 text-muted-foreground tabular-nums">{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>
      {list.isError ? <p className="text-sm text-destructive">{list.error.message}</p> : null}
      {accept.error || dismiss.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(accept.error ?? dismiss.error)?.message}
        </p>
      ) : null}
      {list.isPending ? <p className="text-sm text-muted-foreground">Učitavam…</p> : null}
      {list.data && !list.data.items.length ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {status === 'new' ? 'Nema novih predloga. Stižu iz bloga, praznika i analitike.' : 'Prazno.'}
        </p>
      ) : null}
      <ul className="space-y-3">
        {list.data?.items.map((s) => (
          <li key={s.id}>
            <Card>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{SOURCE[s.source]}</Badge>
                  {s.score !== null ? (
                    <span className="text-xs text-muted-foreground">ocena {Math.round(s.score)}</span>
                  ) : null}
                  {s.expiresAt && s.status === 'new' ? (
                    <span className="text-xs text-muted-foreground">
                      važi do{' '}
                      {new Date(s.expiresAt).toLocaleDateString('sr-Latn-RS', {
                        day: 'numeric',
                        month: 'short',
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
                      Prihvati
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss.mutate(s.id)}
                      disabled={dismiss.isPending}
                    >
                      Odbaci
                    </Button>
                  </div>
                ) : null}
                {s.status === 'accepted' && s.acceptedPostId ? (
                  <a href={`/app/posts/${s.acceptedPostId}`} className="text-sm underline">
                    Otvori nacrt
                  </a>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
