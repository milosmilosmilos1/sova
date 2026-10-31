'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Film,
  Pencil,
  RefreshCw,
  Search,
  SkipForward,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'

import { ThemeNotice } from '@/components/design/theme-notice'
import { api } from '@/components/shared/api-client'
import { BulkBar, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { ErrorBox } from '@/components/shared/error-box'
import { MediaThumb } from '@/components/shared/media-thumb'
import { VideoDialog } from '@/components/review/video-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'
import { cn } from '@/lib/utils'

type Tab = 'waiting' | 'approved' | 'published' | 'skipped' | 'all'
type Format = 'carousel' | 'single' | 'story' | 'video' | 'text'

interface Item {
  id: string
  title: string | null
  status: string
  format: Format
  slides: number
  thumb: string | null
  thumbKind: 'image' | 'video'
  flowName: string | null
  platforms: SocialPlatform[]
  scheduledFor: string | null
  createdAt: string
}

interface Detail {
  post: {
    id: string
    brandId: string
    title: string | null
    status: string
    version: number
    masterText: string
    firstComment: string | null
    scheduledFor: string | null
    actions: string[]
    targets: Array<{
      socialAccountId: string
      platform: SocialPlatform
      accountName: string | null
      accountUsername: string | null
      text: string
      usesMaster: boolean
    }>
    media: Array<{
      id: string
      url: string | null
      mimeType: string | null
      width: number | null
      height: number | null
    }>
  }
  flowName: string | null
  canRegenerate: boolean
  suggestedAt: string
  limits: Record<string, number>
}

const INTL: Record<string, string> = { 'sr-Latn': 'sr-Latn-RS', en: 'en-GB', uk: 'uk-UA' }

/**
 * Odobravanje (D-108): lista nacrta po karticama, pregled slajdova i panel za odluku (opis po mreži,
 * termin, sačuvaj i zakaži, objavi odmah, generiši ponovo, preskoči, preuzmi).
 */
export function ReviewDesk({
  brandId,
  timeZone,
  textPrice,
  canEdit = false,
}: {
  brandId: string
  timeZone: string
  textPrice: number
  /** sme da uskladi nacrte sa temom brenda (D-125) */
  canEdit?: boolean
}) {
  const t = useTranslations('review')
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('waiting')
  const [q, setQ] = useState('')
  const [format, setFormat] = useState<Format | ''>('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [selected, setSelected] = useState<string | null>(null)
  const listKey = ['review', brandId, tab, q, format, sort]
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const p = new URLSearchParams({ brandId, tab, sort })
      if (q.trim()) p.set('q', q.trim())
      if (format) p.set('format', format)
      return api<{ items: Item[]; counts: Record<Tab, number> }>(`/api/approvals?${p.toString()}`)
    },
  })
  const items = list.data?.items ?? []
  const current = selected && items.some((i) => i.id === selected) ? selected : (items[0]?.id ?? null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['review', brandId] })
  // nacrti usklađeni sa temom (D-125) imaju nove slajdove: lista i otvoren nacrt se čitaju ponovo
  const refreshAfterTheme = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['review'] })
    void qc.invalidateQueries({ queryKey: ['review-detail'] })
  }, [qc])
  // označavanje više nacrta (D-119): preskakanje ili brisanje svih označenih odjednom
  const tb = useTranslations('bulk')
  const selection = useSelection(items.map((i) => i.id))
  const bulk = useMutation({
    mutationFn: (input: { ids: string[]; action: 'delete' | 'skip' }) =>
      api<{ done: string[]; failed: Array<{ id: string; message: string }> }>('/api/posts/bulk', {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      selection.clear()
      void refresh()
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw aria-hidden />
            {t('refresh')}
          </Button>
          <Button nativeButton={false} render={<Link href="/app/flows/new" />}>
            {t('newFlow')}
          </Button>
        </div>
      </div>

      <ThemeNotice brandId={brandId} canEdit={canEdit} onDone={refreshAfterTheme} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('title')}>
          {(['waiting', 'approved', 'published', 'skipped', 'all'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {t(`tabs.${k}`)}
              <span className={cn('rounded-full px-1.5 text-xs', tab === k ? 'bg-white/20' : 'bg-muted')}>
                {list.data?.counts[k] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('search')}</span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              className="w-48 pl-8"
            />
          </label>
          <select
            aria-label={t('formatFilter')}
            value={format}
            onChange={(e) => setFormat(e.target.value as Format | '')}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t('formatFilter')}</option>
            {(['carousel', 'single', 'story', 'video', 'text'] as const).map((f) => (
              <option key={f} value={f}>
                {t(`formats.${f}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('sort.new')}
            value={sort}
            onChange={(e) => setSort(e.target.value as 'new' | 'old')}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="new">{t('sort.new')}</option>
            <option value="old">{t('sort.old')}</option>
          </select>
        </div>
      </div>

      <ErrorBox error={list.error} />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <section aria-label={t('listTitle')} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t('listTitle')} <span className="ml-1 rounded-full bg-muted px-1.5">{items.length}</span>
            </p>
            {items.length ? <SelectAllBox selection={selection} className="text-xs" /> : null}
          </div>
          {bulk.data ? (
            <p role="status" className="text-xs text-muted-foreground">
              {bulk.data.failed.length
                ? `${tb('resultFailed', { done: bulk.data.done.length, failed: bulk.data.failed.length })} ${bulk.data.failed[0]!.message}`
                : tb('result', { done: bulk.data.done.length })}
            </p>
          ) : null}
          <ErrorBox error={bulk.error} />
          {items.length === 0 && list.data ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t(tab === 'waiting' ? 'empty.waiting' : 'empty.other')}
            </p>
          ) : null}
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-2">
                <SelectBox
                  selection={selection}
                  id={i.id}
                  label={i.title ?? t('formats.text')}
                  className="mt-3"
                />
                <button
                  type="button"
                  onClick={() => setSelected(i.id)}
                  aria-current={current === i.id ? 'true' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 gap-3 rounded-lg border bg-card p-2 text-left',
                    current === i.id && 'border-primary ring-1 ring-primary',
                    selection.has(i.id) && 'bg-primary/5',
                  )}
                >
                  {i.thumb ? (
                    <MediaThumb url={i.thumb} kind={i.thumbKind} className="size-14 rounded-md" />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-md bg-muted">
                      <FileText className="size-5 text-muted-foreground" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">{i.title ?? t('formats.text')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`formats.${i.format}`)}
                      {i.slides > 1 ? ` · ${t('slides', { n: i.slides })}` : ''}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`status.${i.status}` as 'status.draft')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {current ? (
          <DetailPanes
            key={current}
            postId={current}
            timeZone={timeZone}
            textPrice={textPrice}
            onChanged={() => void refresh()}
          />
        ) : (
          <Card className="lg:col-span-2">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {t('select')}
            </CardContent>
          </Card>
        )}
      </div>
      <BulkBar selection={selection}>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending}
          onClick={() =>
            window.confirm(tb('skipConfirm', { count: selection.count })) &&
            bulk.mutate({ ids: [...selection.selected], action: 'skip' })
          }
        >
          <SkipForward aria-hidden />
          {tb('skip')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={bulk.isPending}
          onClick={() =>
            window.confirm(tb('deleteConfirm', { count: selection.count })) &&
            bulk.mutate({ ids: [...selection.selected], action: 'delete' })
          }
        >
          <Trash2 aria-hidden />
          {tb('delete')}
        </Button>
      </BulkBar>
    </div>
  )
}

/** Pregled i panel za odluku jednog nacrta; koristi ga i Studio za objavu iz razgovora (D-116). */
export function DetailPanes({
  postId,
  timeZone,
  textPrice,
  onChanged,
}: {
  postId: string
  timeZone: string
  textPrice: number
  onChanged: () => void
}) {
  const t = useTranslations('review')
  const query = useQuery({
    queryKey: ['review-detail', postId],
    queryFn: () => api<Detail>(`/api/approvals/${postId}`),
  })
  if (!query.data)
    return (
      <div className="lg:col-span-2">
        {query.error ? (
          <ErrorBox error={query.error} />
        ) : (
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        )}
      </div>
    )
  // obrazac se puni podacima nacrta; nova verzija posle odluke dobija nov obrazac (key)
  return (
    <DetailForm
      key={query.data.post.version}
      detail={query.data}
      timeZone={timeZone}
      textPrice={textPrice}
      onChanged={() => {
        void query.refetch()
        onChanged()
      }}
      t={t}
    />
  )
}

function DetailForm({
  detail,
  timeZone,
  textPrice,
  onChanged,
  t,
}: {
  detail: Detail
  timeZone: string
  textPrice: number
  onChanged: () => void
  t: ReturnType<typeof useTranslations<'review'>>
}) {
  const locale = useLocale()
  const { post } = detail
  const [slide, setSlide] = useState(0)
  const [netTab, setNetTab] = useState<string>('base')
  const [master, setMaster] = useState(post.masterText)
  const [firstComment, setFirstComment] = useState(post.firstComment ?? '')
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(post.targets.map((tg) => [tg.socialAccountId, tg.usesMaster ? '' : tg.text])),
  )
  const initial = wallClock(post.scheduledFor ?? detail.suggestedAt, timeZone)
  const [when, setWhen] = useState(`${initial.date}T${initial.time}`)
  const [notice, setNotice] = useState<string | null>(null)
  const [videoOpen, setVideoOpen] = useState(false)
  const canApprove = post.actions.includes('approve') || post.actions.includes('schedule')
  const editable = ['draft', 'in_review', 'approved', 'rejected', 'canceled', 'failed'].includes(post.status)
  const media = post.media.filter((m) => m.url)
  const edits = () => ({
    version: post.version,
    masterText: master,
    firstComment: firstComment.trim() ? firstComment.trim() : null,
    texts,
  })
  const fmt = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const act = useMutation({
    mutationFn: async (kind: 'schedule' | 'publish' | 'save' | 'skip' | 'regenerate') => {
      if (kind === 'schedule') {
        const [date, time] = when.split('T')
        const scheduledFor = zonedToUtc(date!, time!, timeZone)
        await api(`/api/approvals/${post.id}/schedule`, {
          method: 'POST',
          json: { ...edits(), scheduledFor },
        })
        return t('panel.scheduled', { when: fmt.format(new Date(scheduledFor)) })
      }
      if (kind === 'publish')
        await api(`/api/approvals/${post.id}/publish`, { method: 'POST', json: edits() })
      if (kind === 'save') await api(`/api/approvals/${post.id}/save`, { method: 'POST', json: edits() })
      if (kind === 'skip')
        await api(`/api/approvals/${post.id}/skip`, { method: 'POST', json: { version: post.version } })
      if (kind === 'regenerate')
        await api(`/api/approvals/${post.id}/regenerate`, { method: 'POST', json: { version: post.version } })
      return t('panel.done')
    },
    onSuccess: (message) => {
      setNotice(message)
      onChanged()
    },
  })

  const activeTarget = post.targets.find((tg) => tg.socialAccountId === netTab)
  const limit = activeTarget
    ? (detail.limits[activeTarget.platform] ?? 2200)
    : Math.min(...Object.values(detail.limits), 63206)
  const value = activeTarget ? (texts[activeTarget.socialAccountId] ?? '') : master
  const shown = activeTarget && !value ? master : value

  return (
    <>
      <section className="space-y-3">
        <Card>
          <CardContent className="space-y-3 pt-6">
            {media.length ? (
              <div className="relative overflow-hidden rounded-xl bg-muted">
                {media[slide]?.mimeType?.startsWith('video') ? (
                  <video
                    src={media[slide]!.url!}
                    controls
                    playsInline
                    className="mx-auto max-h-[70vh] w-full bg-black"
                    aria-label={t('preview.slide', { n: slide + 1, total: media.length })}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- potpisan URL slajda
                  <img
                    src={media[slide]!.url!}
                    alt={t('preview.slide', { n: slide + 1, total: media.length })}
                    className="mx-auto max-h-[70vh] w-auto object-contain"
                  />
                )}
                {media.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSlide((s) => Math.max(0, s - 1))}
                      disabled={slide === 0}
                      className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow disabled:opacity-40"
                      aria-label={t('preview.prev')}
                    >
                      <ChevronLeft className="size-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlide((s) => Math.min(media.length - 1, s + 1))}
                      disabled={slide === media.length - 1}
                      className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow disabled:opacity-40"
                      aria-label={t('preview.next')}
                    >
                      <ChevronRight className="size-5" aria-hidden />
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="rounded-xl bg-muted p-10 text-center text-sm text-muted-foreground">
                {t('preview.noMedia')}
              </p>
            )}
            {media.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {media.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSlide(i)}
                    aria-label={t('preview.slide', { n: i + 1, total: media.length })}
                    className={cn(
                      'shrink-0 overflow-hidden rounded-md border-2',
                      i === slide ? 'border-primary' : 'border-transparent',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- sličica slajda */}
                    <img src={m.url!} alt="" className="h-16 w-auto object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/app/posts/${post.id}`} />}
              >
                <Pencil aria-hidden />
                {t('actions.edit')}
              </Button>
              {media.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={`/api/approvals/${post.id}/download`} />}
                >
                  <Download aria-hidden />
                  {t('actions.download')}
                </Button>
              ) : null}
              {media.length >= 2 && media.every((m) => !m.mimeType?.startsWith('video')) ? (
                <Button size="sm" variant="outline" onClick={() => setVideoOpen(true)}>
                  <Film aria-hidden />
                  {t('actions.makeVideo')}
                </Button>
              ) : null}
            </div>
            <VideoDialog
              open={videoOpen}
              onOpenChange={setVideoOpen}
              postId={post.id}
              brandId={post.brandId}
              slides={media.map((m) => m.url!)}
              onCreated={onChanged}
            />
          </CardContent>
        </Card>
      </section>

      <section aria-label={t('panel.decision')}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {t('panel.decision')}
                </p>
                <Badge variant={post.status === 'in_review' ? 'default' : 'secondary'}>
                  {t(`status.${post.status}` as 'status.draft')}
                </Badge>
              </div>
              <p className="text-lg leading-snug font-semibold">{post.title}</p>
              {detail.flowName ? (
                <p className="text-xs text-muted-foreground">
                  {t('panel.fromFlow', { name: detail.flowName })}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t('panel.networks')}</p>
                <Link href="/app/accounts" className="text-xs text-primary hover:underline">
                  {t('panel.manageAccounts')}
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('panel.caption')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={netTab === 'base'}
                  onClick={() => setNetTab('base')}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    netTab === 'base' && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  {t('panel.base')}
                </button>
                {post.targets.map((tg) => (
                  <button
                    key={tg.socialAccountId}
                    type="button"
                    role="tab"
                    aria-selected={netTab === tg.socialAccountId}
                    onClick={() => setNetTab(tg.socialAccountId)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs',
                      netTab === tg.socialAccountId && 'border-primary bg-primary/10 text-primary',
                    )}
                  >
                    {PLATFORMS[tg.platform]?.label ?? tg.platform}
                    {texts[tg.socialAccountId] ? ' •' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="desk-caption">{t('panel.caption')}</Label>
                <span
                  className={cn(
                    'text-xs',
                    shown.length > limit ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {shown.length} / {limit}
                </span>
              </div>
              <Textarea
                id="desk-caption"
                rows={10}
                disabled={!editable}
                value={activeTarget ? value : master}
                placeholder={activeTarget ? master : undefined}
                onChange={(e) =>
                  activeTarget
                    ? setTexts((cur) => ({ ...cur, [activeTarget.socialAccountId]: e.target.value }))
                    : setMaster(e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                {activeTarget && !value ? t('panel.usesBase') : t('panel.captionHint')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desk-comment">{t('panel.firstComment')}</Label>
              <Input
                id="desk-comment"
                disabled={!editable}
                value={firstComment}
                maxLength={2200}
                onChange={(e) => setFirstComment(e.target.value)}
              />
            </div>

            {canApprove ? (
              <div className="space-y-1.5">
                <Label htmlFor="desk-when">{t('panel.scheduleAt')}</Label>
                <Input
                  id="desk-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('panel.timezone', { tz: timeZone })}</p>
              </div>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {t('panel.noApprove')}
              </p>
            )}

            <ErrorBox error={act.error} />
            {notice && !act.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}

            <div className="grid gap-2">
              {canApprove ? (
                <Button disabled={act.isPending || !editable} onClick={() => act.mutate('schedule')}>
                  {act.isPending && act.variables === 'schedule'
                    ? t('actions.saving')
                    : t('actions.saveSchedule')}
                </Button>
              ) : (
                <Button disabled={act.isPending || !editable} onClick={() => act.mutate('save')}>
                  {act.isPending && act.variables === 'save' ? t('actions.saving') : t('actions.save')}
                </Button>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canApprove || act.isPending || !editable}
                  onClick={() => window.confirm(t('actions.confirmPublish')) && act.mutate('publish')}
                >
                  {t('actions.publishNow')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!detail.canRegenerate || act.isPending}
                  onClick={() =>
                    window.confirm(t('actions.confirmRegenerate', { tokens: textPrice })) &&
                    act.mutate('regenerate')
                  }
                >
                  {act.isPending && act.variables === 'regenerate'
                    ? t('actions.regenerating')
                    : t('actions.regenerate')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={
                    act.isPending ||
                    !['draft', 'in_review', 'approved', 'scheduled', 'paused', 'failed'].includes(post.status)
                  }
                  onClick={() => window.confirm(t('actions.confirmSkip')) && act.mutate('skip')}
                >
                  {t('actions.skip')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
