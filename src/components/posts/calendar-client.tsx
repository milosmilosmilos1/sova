'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ApiResponse } from '@/lib/api/response'

interface Item {
  postId: string
  title: string | null
  excerpt: string
  status: string
  statusLabel: string
  scheduledFor: string | null
  targets: Array<{ platform: string; status: string }>
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path)
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

const DAYS = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned']

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const start = new Date(first.getTime() - offset * 86_400_000)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000))
}

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-foreground',
  in_review: 'bg-amber-100 text-amber-900',
  approved: 'bg-sky-100 text-sky-900',
  scheduled: 'bg-emerald-100 text-emerald-900',
  paused: 'bg-zinc-200 text-zinc-800',
  published: 'bg-emerald-600 text-white',
  partially_published: 'bg-amber-500 text-white',
  failed: 'bg-red-100 text-red-900',
  canceled: 'bg-zinc-100 text-zinc-500 line-through',
}

export function CalendarClient({
  brandId,
  brandName,
  timezone,
}: {
  brandId: string
  brandName: string
  timezone: string
}) {
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const grid = monthGrid(cursor.year, cursor.month)
  const from = grid[0]!.toISOString()
  const to = new Date(grid[41]!.getTime() + 86_400_000 - 1).toISOString()
  const cal = useQuery({
    queryKey: ['calendar', brandId, from, to],
    queryFn: () =>
      api<{ items: Item[] }>(
        `/api/calendar?brandId=${brandId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  })
  const byDay = new Map<string, Item[]>()
  for (const it of cal.data?.items ?? []) {
    if (!it.scheduledFor) continue
    const k = dayKey(it.scheduledFor, timezone)
    byDay.set(k, [...(byDay.get(k) ?? []), it])
  }
  const monthLabel = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long', year: 'numeric' }).format(
    new Date(cursor.year, cursor.month, 1),
  )
  const todayKey = dayKey(now.toISOString(), timezone)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kalendar</h1>
          <p className="text-sm text-muted-foreground">
            {brandName} · zona {timezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCursor((c) =>
                c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 },
              )
            }
          >
            ‹
          </Button>
          <span className="min-w-40 text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCursor((c) =>
                c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 },
              )
            }
          >
            ›
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
          >
            Danas
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/app/posts/new" />}>
            Nova objava
          </Button>
        </div>
      </div>
      {cal.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {cal.error.message}
        </p>
      ) : null}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {DAYS.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 font-medium">
            {d}
          </div>
        ))}
        {grid.map((d) => {
          const key = d.toISOString().slice(0, 10)
          const items = byDay.get(key) ?? []
          const inMonth = d.getUTCMonth() === cursor.month
          return (
            <div
              key={key}
              className={`min-h-24 bg-background p-1 ${inMonth ? '' : 'opacity-50'} ${key === todayKey ? 'ring-2 ring-primary ring-inset' : ''}`}
            >
              <div className="mb-1 text-right text-muted-foreground">{d.getUTCDate()}</div>
              <div className="space-y-1">
                {items.slice(0, 4).map((it) => (
                  <Link
                    key={it.postId}
                    href={`/app/posts/${it.postId}`}
                    className={`block truncate rounded px-1 py-0.5 ${STATUS_COLOR[it.status] ?? 'bg-muted'}`}
                    title={`${it.statusLabel}: ${it.excerpt}`}
                  >
                    {new Date(it.scheduledFor!).toLocaleTimeString('sr-Latn-RS', {
                      timeZone: timezone,
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    {it.title ?? it.excerpt}
                  </Link>
                ))}
                {items.length > 4 ? <p className="text-muted-foreground">+{items.length - 4}</p> : null}
              </div>
            </div>
          )
        })}
      </div>
      {cal.isPending ? <p className="text-sm text-muted-foreground">Učitavam kalendar…</p> : null}
      {cal.data && cal.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema zakazanih objava u ovom mesecu.</p>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_COLOR).map(([s, cls]) => (
          <Badge key={s} variant="outline" className={cls}>
            {s}
          </Badge>
        ))}
      </div>
    </div>
  )
}
