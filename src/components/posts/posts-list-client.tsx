'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { bulkRequest } from '@/components/shared/api-client'
import { BulkBar, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { ErrorBox } from '@/components/shared/error-box'
import { MediaThumb } from '@/components/shared/media-thumb'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PLATFORMS } from '@/config/platforms'
import { INTL_UI } from '@/i18n/config'
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
  thumbnailKind: 'image' | 'video'
  updatedAt: string
}

/** Filter statusa: vrednost za API i ključ natpisa u `postsList.filters`. */
const FILTERS = [
  ['', 'all'],
  ['draft', 'draft'],
  ['in_review', 'in_review'],
  ['approved', 'approved'],
  ['scheduled,paused', 'scheduled'],
  ['published,partially_published', 'published'],
  ['failed', 'failed'],
  ['rejected,canceled', 'rejected'],
] as const

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
  const t = useTranslations('postsList')
  const tb = useTranslations('bulk')
  const locale = useLocale()
  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString(INTL_UI[locale], { dateStyle: 'medium', timeStyle: 'short' })
  const qc = useQueryClient()
  const posts = useQuery({
    queryKey: ['posts', brandId, status],
    queryFn: () =>
      api<{ items: Item[]; total: number }>(
        `/api/posts?brandId=${brandId}${status ? `&status=${status}` : ''}&pageSize=50`,
      ),
  })
  // označavanje više objava (D-119): brisanje ide kroz ista pravila kao pojedinačno
  const selection = useSelection(canEdit ? (posts.data?.items ?? []).map((p) => p.id) : [])
  const bulk = useMutation({
    mutationFn: (ids: string[]) => bulkRequest('/api/posts/bulk', { action: 'delete' }, ids),
    onSuccess: () => selection.clear(),
    // i posle greške: deo objava je možda već obrisan (D-126)
    onSettled: () => qc.invalidateQueries({ queryKey: ['posts', brandId] }),
  })
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle', { brand: brandName })}</p>
        </div>
        {canEdit ? (
          <Button nativeButton={false} render={<Link href="/app/posts/new" />}>
            {t('newPost')}
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
            {t(`filters.${label}`)}
          </Button>
        ))}
      </div>
      {posts.isPending ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      {posts.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {posts.error.message}
        </p>
      ) : null}
      {posts.data && posts.data.items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</CardContent>
        </Card>
      ) : null}
      {bulk.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {bulk.data.failed.length
            ? `${tb('resultFailed', { done: bulk.data.done.length, failed: bulk.data.failed.length })} ${bulk.data.failed[0]!.message}`
            : tb('result', { done: bulk.data.done.length })}
        </p>
      ) : null}
      <ErrorBox error={bulk.error} />
      {posts.data?.items.length && canEdit ? <SelectAllBox selection={selection} className="px-3" /> : null}
      {posts.data?.items.length ? (
        <ul className="divide-y rounded-lg border">
          {posts.data.items.map((p) => (
            <li key={p.id} className={`flex items-start gap-1 ${selection.has(p.id) ? 'bg-primary/5' : ''}`}>
              {canEdit ? (
                <SelectBox
                  selection={selection}
                  id={p.id}
                  label={p.title ?? p.masterText.slice(0, 60)}
                  className="mt-7 ml-3"
                />
              ) : null}
              <Link
                href={`/app/posts/${p.id}`}
                className="flex min-w-0 flex-1 items-start gap-3 p-3 hover:bg-muted/50"
              >
                {p.thumbnailUrl ? (
                  <MediaThumb
                    url={p.thumbnailUrl}
                    kind={p.thumbnailKind}
                    className="size-14 rounded-md border"
                  />
                ) : (
                  <div className="size-14 shrink-0 rounded-md border bg-muted" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {p.title ?? p.masterText.slice(0, 60) ?? t('untitled')}
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
                    {p.scheduledFor ? t('when', { date: dateTime(p.scheduledFor) }) : t('noWhen')} ·{' '}
                    {t('edited', { date: dateTime(p.updatedAt) })}
                    {p.mediaCount ? ` · ${t('media', { count: p.mediaCount })}` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <BulkBar selection={selection}>
        <Button
          size="sm"
          variant="destructive"
          disabled={bulk.isPending}
          onClick={() =>
            window.confirm(tb('deleteConfirm', { count: selection.count })) &&
            bulk.mutate([...selection.selected])
          }
        >
          <Trash2 aria-hidden />
          {tb('delete')}
        </Button>
      </BulkBar>
    </div>
  )
}
