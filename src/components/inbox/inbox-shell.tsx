'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ExternalLink,
  Inbox,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
} from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { InboxClient } from '@/components/autopilot/inbox-client'
import { api } from '@/components/shared/api-client'
import { BulkBar, runBulk, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { REPLY_MAX } from '@/lib/schemas/inbox'
import { cn } from '@/lib/utils'

/**
 * Inbox (D-117): poruke, komentari i recenzije sa povezanih mreža na jednom mestu, i predlozi
 * sadržaja kao četvrta kartica. Odgovor ide kroz mrežu; Sova može da predloži odgovor (1 token).
 * Dok Meta ne odobri dozvole, prekidač `inbox` je isključen i kartice mreža to objašnjavaju.
 */
type Kind = 'message' | 'comment' | 'review'
type Tab = Kind | 'suggestions'

interface Thread {
  id: string
  kind: Kind
  platform: SocialPlatform
  accountId: string
  accountName: string | null
  authorName: string | null
  authorHandle: string | null
  preview: string
  lastMessageAt: string
  unread: boolean
  status: 'open' | 'done'
  rating: number | null
  postPermalink: string | null
  postExcerpt: string | null
}

interface InboxData {
  enabled: boolean
  threads: Thread[]
  counts: Record<Kind, { total: number; unread: number }>
  accounts: Array<{ id: string; platform: SocialPlatform; name: string; read: Kind[]; send: Kind[] }>
  replyPrice: number
}

interface Message {
  id: string
  direction: 'in' | 'out'
  authorName: string | null
  body: string
  sentAt: string
  source: string
}

const INTL: Record<string, string> = { 'sr-Latn': 'sr-Latn-RS', en: 'en-GB', uk: 'uk-UA' }
const KINDS: Kind[] = ['message', 'comment', 'review']

export function InboxShell({
  brandId,
  brandName,
  canEdit,
  enabled,
}: {
  brandId: string
  brandName: string
  canEdit: boolean
  /** prekidač `inbox` za radni prostor (sa servera) */
  enabled: boolean
}) {
  const t = useTranslations('inbox')
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>(enabled ? 'message' : 'suggestions')
  const [platform, setPlatform] = useState<SocialPlatform | ''>('')
  const [status, setStatus] = useState<'all' | 'open' | 'done'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const kind: Kind = tab === 'suggestions' ? 'message' : tab
  const inbox = useQuery({
    queryKey: ['inbox', brandId, kind, platform, status],
    queryFn: () => {
      const p = new URLSearchParams({ brandId, kind, status })
      if (platform) p.set('platform', platform)
      return api<InboxData>(`/api/inbox?${p.toString()}`)
    },
  })
  const sync = useMutation({
    mutationFn: () =>
      api<{ threads: number; inserted: number; dms: number; errors: string[] }>('/api/inbox/sync', {
        method: 'POST',
        json: { brandId },
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['inbox', brandId] }),
  })

  const data = inbox.data
  const threads = data?.threads ?? []
  // označavanje više razgovora (D-119): „Rešeno” za sve označene odjednom
  const tb = useTranslations('bulk')
  const selection = useSelection(canEdit ? threads.map((x) => x.id) : [])
  const bulkDone = useMutation({
    mutationFn: (ids: string[]) =>
      runBulk(ids, (id) => api(`/api/inbox/threads/${id}`, { method: 'PATCH', json: { status: 'done' } })),
    onSuccess: () => {
      selection.clear()
      void qc.invalidateQueries({ queryKey: ['inbox', brandId] })
    },
  })
  const current = selected && threads.some((x) => x.id === selected) ? selected : (threads[0]?.id ?? null)
  const readers = (data?.accounts ?? []).filter((a) => a.read.includes(kind))
  const platforms = [...new Set((data?.accounts ?? []).map((a) => a.platform))]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {tab !== 'suggestions' && enabled && canEdit ? (
          <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className={cn(sync.isPending && 'animate-spin')} aria-hidden />
            {sync.isPending ? t('syncing') : t('sync')}
          </Button>
        ) : null}
      </div>

      {!enabled && tab !== 'suggestions' ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">{t('waiting.title')}</p>
          <p className="mt-1">{t('waiting.text')}</p>
        </div>
      ) : null}
      <ErrorBox error={sync.error} />
      {sync.data?.errors.length ? (
        <p className="text-xs text-muted-foreground">
          {t('syncErrors', { list: sync.data.errors.join('; ') })}
        </p>
      ) : null}

      <div
        className="flex flex-wrap gap-1 rounded-xl border bg-card p-1"
        role="tablist"
        aria-label={t('title')}
      >
        {[...KINDS, 'suggestions' as const].map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k)
              setSelected(null)
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
              tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {t(`tabs.${k}`)}
            {k !== 'suggestions' && data?.counts[k].unread ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  tab === k ? 'bg-white/20' : 'bg-primary/10 text-primary',
                )}
              >
                {data.counts[k].unread}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'suggestions' ? (
        <InboxClient brandId={brandId} brandName={brandName} canEdit={canEdit} embedded />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <section aria-label={t('listLabel')} className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={platform === ''}
                onClick={() => setPlatform('')}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  platform === '' && 'border-primary bg-primary/10 text-primary',
                )}
              >
                {t('allNetworks')}
              </button>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={platform === p}
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs',
                    platform === p && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  {PLATFORMS[p].label}
                </button>
              ))}
              <label className="sr-only" htmlFor="inbox-status">
                {t('statusLabel')}
              </label>
              <select
                id="inbox-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="ml-auto h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="all">{t('status.all')}</option>
                <option value="open">{t('status.open')}</option>
                <option value="done">{t('status.done')}</option>
              </select>
            </div>
            <ErrorBox error={inbox.error} />
            {inbox.isPending ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : null}
            {data && !threads.length ? (
              <div className="space-y-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto size-5" aria-hidden />
                <p>{t(`empty.${kind}`)}</p>
                {enabled && !readers.length ? (
                  <p className="text-xs">
                    {data.accounts.length ? t('noPermission') : t('noAccounts')}{' '}
                    <Link href="/app/accounts" className="text-primary hover:underline">
                      {t('connect')}
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
            {canEdit && threads.length ? <SelectAllBox selection={selection} className="text-xs" /> : null}
            <ul className="max-h-[65vh] space-y-1.5 overflow-y-auto">
              {threads.map((x) => (
                <li key={x.id} className="flex items-start gap-2">
                  {canEdit ? (
                    <SelectBox
                      selection={selection}
                      id={x.id}
                      label={x.authorName ?? x.authorHandle ?? t('unknown')}
                      className="mt-4"
                    />
                  ) : null}
                  <ThreadButton
                    thread={x}
                    active={x.id === current}
                    onSelect={() => {
                      setSelected(x.id)
                      // na telefonu je razgovor ispod spiska
                      if (window.matchMedia('(max-width: 1023px)').matches)
                        window.setTimeout(() => paneRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
                    }}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          </section>

          <div ref={paneRef} className="min-w-0 scroll-mt-4">
            {current ? (
              <ThreadPane
                key={current}
                id={current}
                brandId={brandId}
                canEdit={canEdit}
                enabled={enabled}
                replyPrice={data?.replyPrice ?? 1}
                t={t}
              />
            ) : (
              <div className="grid min-h-[20rem] place-items-center rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                {t('select')}
              </div>
            )}
          </div>
        </div>
      )}
      {tab !== 'suggestions' ? (
        <BulkBar selection={selection}>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkDone.isPending}
            onClick={() => bulkDone.mutate([...selection.selected])}
          >
            <CheckCircle2 aria-hidden />
            {tb('markDone')}
          </Button>
        </BulkBar>
      ) : null}
    </div>
  )
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn('size-3', i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
        />
      ))}
    </span>
  )
}

function ThreadButton({
  thread: x,
  active,
  onSelect,
  t,
}: {
  thread: Thread
  active: boolean
  onSelect: () => void
  t: ReturnType<typeof useTranslations<'inbox'>>
}) {
  const locale = useLocale()
  const when = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const name = x.authorName ?? x.authorHandle ?? t('unknown')
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full gap-2.5 rounded-lg border p-2.5 text-left',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
      )}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm', x.unread ? 'font-semibold' : 'font-medium')}>{name}</span>
          {x.unread ? (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={t('unread')} />
          ) : null}
          {x.status === 'done' ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-label={t('status.done')} />
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{x.preview}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{PLATFORMS[x.platform]?.label ?? x.platform}</span>
          {x.rating ? <Stars value={x.rating} label={t('rating', { n: x.rating })} /> : null}
          <span className="ml-auto">{when.format(new Date(x.lastMessageAt))}</span>
        </span>
      </span>
    </button>
  )
}

function ThreadPane({
  id,
  brandId,
  canEdit,
  enabled,
  replyPrice,
  t,
}: {
  id: string
  brandId: string
  canEdit: boolean
  enabled: boolean
  replyPrice: number
  t: ReturnType<typeof useTranslations<'inbox'>>
}) {
  const qc = useQueryClient()
  const locale = useLocale()
  const when = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const [text, setText] = useState('')
  const thread = useQuery({
    queryKey: ['inbox-thread', id],
    queryFn: () =>
      api<{ thread: Thread; messages: Message[]; canReply: boolean }>(`/api/inbox/threads/${id}`),
  })
  // otvoren razgovor je pročitan: brojači na karticama se osvežavaju
  const loaded = Boolean(thread.data)
  useEffect(() => {
    if (loaded) void qc.invalidateQueries({ queryKey: ['inbox', brandId] })
  }, [loaded, qc, brandId])

  const reply = useMutation({
    mutationFn: () => api<Message>(`/api/inbox/threads/${id}/reply`, { method: 'POST', json: { text } }),
    onSuccess: () => {
      setText('')
      void qc.invalidateQueries({ queryKey: ['inbox-thread', id] })
      void qc.invalidateQueries({ queryKey: ['inbox', brandId] })
    },
  })
  const suggest = useMutation({
    mutationFn: () =>
      api<{ reply: string }>(`/api/inbox/threads/${id}/suggest`, { method: 'POST', json: {} }),
    onSuccess: (r) => setText(r.reply),
  })
  const setStatus = useMutation({
    mutationFn: (status: 'open' | 'done') =>
      api(`/api/inbox/threads/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inbox-thread', id] })
      void qc.invalidateQueries({ queryKey: ['inbox', brandId] })
    },
  })

  if (!thread.data)
    return (
      <div className="min-h-[20rem] rounded-xl border bg-card p-4">
        {thread.error ? (
          <ErrorBox error={thread.error} />
        ) : (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        )}
      </div>
    )
  const { thread: x, messages, canReply } = thread.data
  const name = x.authorName ?? x.authorHandle ?? t('unknown')
  const sendable = canEdit && enabled && canReply
  return (
    <section
      aria-label={t('threadLabel', { name })}
      className="flex min-h-[20rem] flex-col rounded-xl border bg-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              x.authorHandle && x.authorName ? `@${x.authorHandle}` : null,
              PLATFORMS[x.platform]?.label,
              x.accountName,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {x.postExcerpt ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {t('onPost')}: {x.postExcerpt}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {x.postPermalink ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={x.postPermalink} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink aria-hidden />
              {t('openPost')}
            </Button>
          ) : null}
          {canEdit ? (
            x.status === 'open' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('done')}
              >
                <CheckCircle2 aria-hidden />
                {t('markDone')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('open')}
              >
                <RotateCcw aria-hidden />
                {t('reopen')}
              </Button>
            )
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {x.rating ? <Stars value={x.rating} label={t('rating', { n: x.rating })} /> : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('max-w-[85%] space-y-1', m.direction === 'out' && 'ml-auto text-right')}
          >
            <p
              className={cn(
                'inline-block rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap',
                m.direction === 'out'
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md bg-muted',
              )}
            >
              {m.body}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {m.direction === 'out'
                ? m.source === 'automation'
                  ? t('fromAutomation')
                  : t('fromBrand')
                : (m.authorName ?? name)}
              {' · '}
              {when.format(new Date(m.sentAt))}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t p-4">
        {!sendable ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {!enabled ? t('replyWaiting') : !canEdit ? t('replyRole') : t('replyPermission')}
          </p>
        ) : null}
        <label htmlFor="inbox-reply" className="sr-only">
          {t('replyLabel')}
        </label>
        <textarea
          id="inbox-reply"
          rows={3}
          value={text}
          maxLength={REPLY_MAX}
          disabled={!sendable || reply.isPending}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(`replyPlaceholder.${x.kind}`)}
          className="block w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <ErrorBox error={reply.error ?? suggest.error ?? setStatus.error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!sendable || suggest.isPending}
            onClick={() => suggest.mutate()}
          >
            {suggest.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {t('suggest', { price: replyPrice })}
          </Button>
          <Button
            size="sm"
            disabled={!sendable || !text.trim() || reply.isPending}
            onClick={() => reply.mutate()}
          >
            {reply.isPending ? t('sending') : t('send')}
          </Button>
        </div>
      </div>
    </section>
  )
}
