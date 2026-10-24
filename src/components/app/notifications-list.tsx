'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import type { ApiResponse } from '@/lib/api/response'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}
export interface NotificationPage {
  items: NotificationItem[]
  unreadCount: number
}

export async function fetchNotifications(
  workspaceId: string | null,
  limit: number,
): Promise<NotificationPage> {
  const q = new URLSearchParams({ limit: String(limit) })
  if (workspaceId) q.set('workspaceId', workspaceId)
  const res = await fetch(`/api/notifications?${q}`)
  const data = (await res.json()) as ApiResponse<NotificationPage>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

export async function markRead(body: {
  ids?: string[]
  all?: boolean
  workspaceId?: string | null
}): Promise<void> {
  const res = await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, workspaceId: body.workspaceId ?? undefined }),
  })
  const data = (await res.json()) as ApiResponse<{ updated: number }>
  if (!data.ok) throw new Error(data.error.message)
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'upravo'
  if (m < 60) return `pre ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `pre ${h} h`
  const d = Math.round(h / 24)
  return `pre ${d} d`
}

/** Lista obaveštenja (strana /app/notifications): klik otvara vezanu objavu i označava red kao pročitan. */
export function NotificationsList({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient()
  const page = useQuery({
    queryKey: ['notifications', workspaceId, 50],
    queryFn: () => fetchNotifications(workspaceId, 50),
  })
  const read = useMutation({
    mutationFn: markRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  if (page.isPending) return <p className="text-sm text-muted-foreground">Učitavam…</p>
  if (page.isError) return <p className="text-sm text-destructive">{page.error.message}</p>
  const { items, unreadCount } = page.data
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount ? `${unreadCount} nepročitano` : 'Sve je pročitano.'}
        </p>
        {unreadCount ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => read.mutate({ all: true, workspaceId })}
            disabled={read.isPending}
          >
            Označi sve kao pročitano
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Još nema obaveštenja.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'opacity-70' : ''}>
              <NotificationRow n={n} onOpen={() => (n.readAt ? undefined : read.mutate({ ids: [n.id] }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function NotificationRow({
  n,
  onOpen,
  compact,
}: {
  n: NotificationItem
  onOpen: () => void
  compact?: boolean
}) {
  const inner = (
    <div className={compact ? 'px-3 py-2' : 'px-4 py-3'}>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${compact ? 'text-sm' : ''}`}>
          {!n.readAt ? (
            <span
              className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle"
              aria-label="nepročitano"
            />
          ) : null}
          {n.title}
        </p>
        <time className="shrink-0 text-xs text-muted-foreground" dateTime={n.createdAt}>
          {timeAgo(n.createdAt)}
        </time>
      </div>
      {n.body ? (
        <p className={`mt-0.5 text-muted-foreground ${compact ? 'line-clamp-2 text-xs' : 'text-sm'}`}>
          {n.body}
        </p>
      ) : null}
    </div>
  )
  if (n.link && n.link.startsWith('/')) {
    return (
      <Link href={n.link as Route} onClick={onOpen} className="block hover:bg-accent/50">
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left hover:bg-accent/50">
      {inner}
    </button>
  )
}
