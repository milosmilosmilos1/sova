'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PLATFORMS } from '@/config/platforms'
import type { ApiResponse } from '@/lib/api/response'

interface Item {
  id: string
  title: string | null
  masterText: string
  status: string
  statusLabel: string
  scheduledFor: string | null
  platforms: string[]
  mediaCount: number
  thumbnailUrl: string | null
  updatedAt: string
}

const FILTERS: Array<[string, string]> = [
  ['', 'Sve'],
  ['draft', 'Nacrti'],
  ['in_review', 'Na odobrenju'],
  ['approved', 'Odobreno'],
  ['scheduled,paused', 'Zakazano'],
  ['published,partially_published', 'Objavljeno'],
  ['failed', 'Neuspelo'],
  ['rejected,canceled', 'Odbijeno i otkazano'],
]

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path)
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

export function PostsListClient({
  brandId,
  brandName,
  canEdit,
  initialStatus,
}: {
  brandId: string
  brandName: string
  canEdit: boolean
  initialStatus: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const posts = useQuery({
    queryKey: ['posts', brandId, status],
    queryFn: () =>
      api<{ items: Item[]; total: number }>(
        `/api/posts?brandId=${brandId}${status ? `&status=${status}` : ''}&pageSize=50`,
      ),
  })
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Objave</h1>
          <p className="text-sm text-muted-foreground">
            Brend: {brandName}. Nacrti, odobravanje, zakazivanje.
          </p>
        </div>
        {canEdit ? (
          <Button nativeButton={false} render={<Link href="/app/posts/new" />}>
            Nova objava
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? 'default' : 'outline'}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {posts.isPending ? <p className="text-sm text-muted-foreground">Učitavam objave…</p> : null}
      {posts.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {posts.error.message}
        </p>
      ) : null}
      {posts.data && posts.data.items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nema objava u ovom filteru.
          </CardContent>
        </Card>
      ) : null}
      {posts.data?.items.length ? (
        <ul className="divide-y rounded-lg border">
          {posts.data.items.map((p) => (
            <li key={p.id}>
              <Link href={`/app/posts/${p.id}`} className="flex items-start gap-3 p-3 hover:bg-muted/50">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="size-14 shrink-0 rounded-md border bg-muted" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {p.title ?? p.masterText.slice(0, 60) ?? 'Bez naslova'}
                    </span>
                    <Badge
                      variant={p.status === 'scheduled' || p.status === 'published' ? 'default' : 'secondary'}
                    >
                      {p.statusLabel}
                    </Badge>
                    {p.platforms.map((pl) => (
                      <Badge key={pl} variant="outline">
                        {PLATFORMS[pl as keyof typeof PLATFORMS]?.label ?? pl}
                      </Badge>
                    ))}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{p.masterText.slice(0, 140)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.scheduledFor
                      ? `Termin: ${new Date(p.scheduledFor).toLocaleString('sr-Latn-RS')}`
                      : 'Bez termina'}{' '}
                    · izmenjeno {new Date(p.updatedAt).toLocaleString('sr-Latn-RS')}
                    {p.mediaCount ? ` · ${p.mediaCount} medija` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
