'use client'

import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { cn } from '@/lib/utils'

interface Item {
  postId: string
  title: string | null
  excerpt: string
  status: string
  scheduledFor: string | null
  targets: Array<{ platform: string; status: string; scheduledAt: string | null }>
  mediaCount: number
  thumb: string | null
}

const DAY = 86_400_000
type PostStatusKey =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed'
  | 'paused'
  | 'canceled'
  | 'rejected'

/** boja tačke i ivice po statusu; tekst ostaje u tokenima teme (kontrast, faza 15) */
const TONE: Record<string, string> = {
  scheduled: 'bg-sky-500',
  approved: 'bg-sky-500',
  publishing: 'bg-sky-500',
  published: 'bg-emerald-600',
  partially_published: 'bg-orange-500',
  in_review: 'bg-amber-500',
  failed: 'bg-red-600',
  draft: 'bg-zinc-400',
  paused: 'bg-zinc-400',
  canceled: 'bg-zinc-300',
  rejected: 'bg-zinc-300',
}
const LEGEND = [
  { key: 'scheduled', tone: 'bg-sky-500' },
  { key: 'published', tone: 'bg-emerald-600' },
  { key: 'in_review', tone: 'bg-amber-500' },
  { key: 'failed', tone: 'bg-red-600' },
] as const

/** Dan objave u zoni brenda kao YYYY-MM-DD. */
function zonedDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}
const utcDay = (d: Date) => d.toISOString().slice(0, 10)
const monday = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY)

function gridDays(view: 'month' | 'week', cursor: Date): Date[] {
  if (view === 'week') {
    const start = monday(cursor)
    return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY))
  }
  const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
  const start = monday(first)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY))
}

function useCalendar(brandId: string, from: Date, to: Date, tag: string) {
  return useQuery({
    queryKey: ['calendar', brandId, tag, utcDay(from), utcDay(to)],
    queryFn: () =>
      api<{ items: Item[]; timezone: string }>(
        `/api/calendar?brandId=${brandId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      ),
  })
}

/**
 * Kalendar (D-115): mesec ili nedelja sa pločicama dana (sličica, vreme, mreže), brojači, sledeća
 * objava i sledećih sedam dana. Dani su u zoni brenda.
 */
export function CalendarClient({ brandId, timezone }: { brandId: string; timezone: string }) {
  const t = useTranslations('calendar')
  const format = useFormatter()
  const locale = useLocale()
  // trenutak otvaranja strane: „danas”, „sledeće” i slobodan dan se računaju od njega
  const [nowMs] = useState(() => Date.now())
  const todayKey = zonedDay(new Date(nowMs).toISOString(), timezone)
  const today = new Date(`${todayKey}T00:00:00Z`)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState<Date>(today)

  const days = gridDays(view, cursor)
  const grid = useCalendar(
    brandId,
    new Date(days[0]!.getTime() - DAY),
    new Date(days[days.length - 1]!.getTime() + 2 * DAY),
    view,
  )
  const upcoming = useCalendar(
    brandId,
    new Date(today.getTime() - DAY),
    new Date(today.getTime() + 15 * DAY),
    'next',
  )

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const item of grid.data?.items ?? []) {
      if (!item.scheduledFor) continue
      const key = zonedDay(item.scheduledFor, timezone)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return map
  }, [grid.data, timezone])

  const month = cursor.getUTCMonth()
  const inMonth = (grid.data?.items ?? []).filter(
    (i) =>
      i.scheduledFor && new Date(`${zonedDay(i.scheduledFor, timezone)}T00:00:00Z`).getUTCMonth() === month,
  )
  const next = (upcoming.data?.items ?? []).filter(
    (i) =>
      i.scheduledFor &&
      new Date(i.scheduledFor).getTime() >= nowMs &&
      ['scheduled', 'approved', 'in_review'].includes(i.status),
  )
  const todayCount = (upcoming.data?.items ?? []).filter(
    (i) => i.scheduledFor && zonedDay(i.scheduledFor, timezone) === todayKey,
  ).length
  const busy = new Set(next.map((i) => zonedDay(i.scheduledFor!, timezone)))
  const freeDay = Array.from({ length: 14 }, (_, i) => utcDay(new Date(today.getTime() + i * DAY))).find(
    (d) => !busy.has(d),
  )

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
  const dayLabel = (
    d: Date,
    opts: { weekday?: 'short' | 'long'; day?: 'numeric'; month?: 'short' | 'long'; year?: 'numeric' },
  ) => format.dateTime(d, { timeZone: 'UTC', ...opts })
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 26 + i)),
    ),
  )
  const move = (dir: -1 | 1) =>
    setCursor((c) =>
      view === 'week'
        ? new Date(c.getTime() + dir * 7 * DAY)
        : new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + dir, 1)),
    )
  const platformsOf = (item: Item) => [...new Set(item.targets.map((x) => x.platform))] as SocialPlatform[]
  const title = (item: Item) => item.title || item.excerpt || t('untitled')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle', { timezone })}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/app/posts/new" />}>
          <Plus className="size-4" aria-hidden />
          {t('newPost')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarDays} label={t('stats.today')} value={t('stats.posts', { count: todayCount })} />
        <Stat
          icon={CalendarClock}
          label={t('stats.upcoming')}
          value={t('stats.posts', { count: next.length })}
        />
        <Stat
          icon={CalendarCheck}
          label={t('stats.published', { month: dayLabel(cursor, { month: 'long' }) })}
          value={String(
            inMonth.filter((i) => i.status === 'published' || i.status === 'partially_published').length,
          )}
        />
        <Stat
          icon={Sparkles}
          label={t('stats.freeDay')}
          value={
            freeDay
              ? dayLabel(new Date(`${freeDay}T00:00:00Z`), {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : '—'
          }
        />
      </div>
      <ErrorBox error={grid.error ?? upcoming.error} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="outline" onClick={() => move(-1)} aria-label={t('prev')}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <h2 className="min-w-40 text-center font-semibold capitalize">
                {view === 'month'
                  ? dayLabel(cursor, { month: 'long', year: 'numeric' })
                  : `${dayLabel(days[0]!, { day: 'numeric', month: 'short' })} – ${dayLabel(days[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </h2>
              <Button size="icon-sm" variant="outline" onClick={() => move(1)} aria-label={t('next')}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCursor(today)}>
                {t('today')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ul className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
                {LEGEND.map((l) => (
                  <li key={l.key} className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', l.tone)} aria-hidden />
                    {t(`legend.${l.key}`)}
                  </li>
                ))}
              </ul>
              <div className="flex rounded-lg border p-0.5" role="tablist" aria-label={t('viewLabel')}>
                {(['month', 'week'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm',
                      view === v
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto px-1">
            <div className={cn('grid min-w-[44rem] grid-cols-7 gap-1.5', grid.isFetching && 'opacity-70')}>
              {weekdays.map((w) => (
                <div key={w} className="px-1 pb-1 text-xs font-medium text-muted-foreground uppercase">
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const key = utcDay(d)
                const items = byDay.get(key) ?? []
                const outside = view === 'month' && d.getUTCMonth() !== month
                const limit = view === 'week' ? 12 : 3
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-1.5',
                      view === 'week' ? 'min-h-72' : 'min-h-28',
                      outside && 'bg-muted/40 text-muted-foreground',
                      key === todayKey && 'border-primary ring-1 ring-primary/40',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full text-xs font-semibold',
                        key === todayKey && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {d.getUTCDate()}
                    </span>
                    {items.slice(0, limit).map((item) => (
                      <Link
                        key={item.postId}
                        href={`/app/posts/${item.postId}`}
                        className="flex items-center gap-1.5 rounded-md bg-muted/60 p-1 text-xs transition-colors hover:bg-muted"
                        title={title(item)}
                      >
                        {item.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                          <img
                            src={item.thumb}
                            alt=""
                            className="size-7 shrink-0 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span
                            className={cn(
                              'ml-1 size-2 shrink-0 rounded-full',
                              TONE[item.status] ?? 'bg-zinc-400',
                            )}
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block font-medium tabular-nums">{time(item.scheduledFor!)}</span>
                          <span className="block truncate text-muted-foreground">{title(item)}</span>
                        </span>
                        <span className="sr-only">{t(`status.${item.status as PostStatusKey}`)}</span>
                      </Link>
                    ))}
                    {items.length > limit ? (
                      <span className="px-1 text-xs text-muted-foreground">
                        {t('more', { count: items.length - limit })}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary to-indigo-700 p-4 text-white">
            {next[0] ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wider text-white/80 uppercase">
                  {t('nextPost')}
                </p>
                {next[0].thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                  <img src={next[0].thumb} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ) : null}
                <p className="font-semibold">{title(next[0])}</p>
                <p className="text-sm text-white/80">
                  {format.dateTime(new Date(next[0].scheduledFor!), {
                    timeZone: timezone,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/app/posts/${next[0].postId}`} />}
                >
                  {t('open')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 py-6 text-center">
                <p className="font-semibold">{t('noNext')}</p>
                <p className="text-sm text-white/80">{t('noNextText')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/app/posts/new" />}
                >
                  {t('newPost')}
                </Button>
              </div>
            )}
          </section>
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <div>
              <h2 className="font-semibold">{t('week')}</h2>
              <p className="text-xs text-muted-foreground">{t('weekHint')}</p>
            </div>
            {next.filter((i) => new Date(i.scheduledFor!).getTime() < nowMs + 7 * DAY).length ? (
              <ul className="space-y-2">
                {next
                  .filter((i) => new Date(i.scheduledFor!).getTime() < nowMs + 7 * DAY)
                  .slice(0, 6)
                  .map((item) => (
                    <li key={item.postId}>
                      <Link
                        href={`/app/posts/${item.postId}`}
                        className="flex items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-muted"
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            TONE[item.status] ?? 'bg-zinc-400',
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{title(item)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {format.dateTime(new Date(item.scheduledFor!), {
                              timeZone: timezone,
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {' · '}
                            {platformsOf(item)
                              .map((p) => PLATFORMS[p]?.label ?? p)
                              .join(', ')}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('weekEmpty')}</p>
            )}
          </section>
        </aside>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">
          {t('monthList', { month: dayLabel(cursor, { month: 'long', year: 'numeric' }) })}
        </h2>
        {inMonth.length ? (
          <ul className="divide-y">
            {inMonth.map((item) => (
              <li key={item.postId}>
                <Link
                  href={`/app/posts/${item.postId}`}
                  className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <span className="w-32 shrink-0 text-muted-foreground tabular-nums">
                    {format.dateTime(new Date(item.scheduledFor!), {
                      timeZone: timezone,
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{title(item)}</span>
                  <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <span
                      className={cn('size-2 rounded-full', TONE[item.status] ?? 'bg-zinc-400')}
                      aria-hidden
                    />
                    {t(`status.${item.status as PostStatusKey}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : grid.data ? (
          <p className="text-sm text-muted-foreground">{t('monthEmpty')}</p>
        ) : null}
      </section>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold">{value}</p>
      </div>
    </div>
  )
}
