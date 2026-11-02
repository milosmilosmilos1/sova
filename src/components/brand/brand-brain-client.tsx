'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Lock, Pencil } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { INTL_UI } from '@/i18n/config'
import type { ApiResponse } from '@/lib/api/response'
import type { BrandProfile, Field, FieldPath } from '@/lib/brand/profile-schema'
import { cn } from '@/lib/utils'

import { FieldEditor, type FieldEdit } from './profile-field-editor'
import { ProfileLogo } from './profile-logo'

/**
 * Brand Brain (faza 6): pokretanje analize sajta sa napretkom, prikaz profila po sekcijama
 * sa pouzdanošću i izvorima, izmena svakog polja na mestu (polje se zaključava), logo sa
 * otpremanjem kad Sova uzme pogrešan (D-133), verzije i vraćanje.
 */
interface ProfileView {
  brandId: string
  exists: boolean
  version: number | null
  lockedFields: string[]
  profile: BrandProfile
  versions: Array<{
    version: number
    isCurrent: boolean
    generatedBy: 'ai' | 'heuristic' | 'manual'
    model: string | null
    createdAt: string
    overallConfidence: number
  }>
  knowledgeChunks: number
  logoUrl: string | null
  logoSource: 'custom' | 'site' | null
}

interface CrawlView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'canceled'
  phase: string | null
  progress: {
    message: string
    percent: number
    pagesFound?: number
    pagesFetched?: number
    summary?: { notes?: string[]; generatedBy?: string; chunks?: number }
  } | null
  pagesFound: number
  pagesFetched: number
  errorMessage: string | null
  profileVersion: number | null
  pages: Array<{ id: string; url: string; type: string; title: string | null; wordCount: number | null }>
}

interface AnalyzeResult {
  crawlId: string
  tokensCharged: number
  firstAnalysis: boolean
}

async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; idempotent?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  if (init.idempotent) headers.set('idempotency-key', crypto.randomUUID())
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(`${data.error.message} (${data.error.code}, ID ${data.error.requestId})`)
  return data.data
}

function ErrorBox({ error }: { error: unknown }) {
  const tc = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : tc('error')}
    </div>
  )
}

function confidenceLabel(c: number): {
  level: 'high' | 'medium' | 'low'
  variant: 'default' | 'secondary' | 'outline'
} {
  if (c >= 0.75) return { level: 'high', variant: 'default' }
  if (c >= 0.45) return { level: 'medium', variant: 'secondary' }
  return { level: 'low', variant: 'outline' }
}

function FieldRow({
  label,
  field,
  path,
  locked,
  onUnlock,
  edit,
  onSave,
  children,
}: {
  label: string
  field: Field<unknown>
  path: FieldPath
  locked: boolean
  onUnlock?: (path: FieldPath) => void
  /** kako se polje menja na mestu; bez njega polje se samo prikazuje */
  edit?: FieldEdit
  onSave?: (path: FieldPath, value: unknown) => Promise<void>
  children: ReactNode
}) {
  const t = useTranslations('brandBrain')
  const conf = confidenceLabel(field.confidence)
  const [editing, setEditing] = useState(false)
  return (
    <div className="space-y-1 border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <Badge variant={conf.variant}>
          {t('field.confidence', { level: t(`confidence.${conf.level}`) })}
        </Badge>
        {locked ? (
          <span className="inline-flex items-center gap-1" title={t('field.lockedTitle')}>
            <Lock className="size-3" aria-hidden /> {t('field.locked')}
            {onUnlock ? (
              <button type="button" className="underline" onClick={() => onUnlock(path)}>
                {t('field.unlock')}
              </button>
            ) : null}
          </span>
        ) : null}
        {field.source_urls.length ? (
          <span className="truncate" title={field.source_urls.join('\n')}>
            {t('field.source', { count: field.source_urls.length })}
          </span>
        ) : null}
        {edit && onSave && !editing ? (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded px-1 font-medium text-primary hover:underline"
            aria-label={t('field.editLabel', { label })}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" aria-hidden />
            {t('field.edit')}
          </button>
        ) : null}
      </div>
      {edit && onSave && editing ? (
        <FieldEditor
          id={`bb-${path.replace('.', '-')}`}
          label={label}
          edit={edit}
          onSave={async (value) => {
            await onSave(path, value)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="text-sm">{children}</div>
      )}
    </div>
  )
}

function Text({ value }: { value: string | number | boolean | null | undefined }) {
  const t = useTranslations('brandBrain')
  if (value === null || value === undefined || value === '')
    return <span className="text-muted-foreground">{t('notFound')}</span>
  if (typeof value === 'boolean') return <span>{value ? t('yes') : t('no')}</span>
  return <span>{String(value)}</span>
}

function List({ items }: { items: string[] }) {
  const t = useTranslations('brandBrain')
  if (!items.length) return <span className="text-muted-foreground">{t('notFound')}</span>
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((it, i) => (
        <li key={`${i}-${it.slice(0, 20)}`}>{it}</li>
      ))}
    </ul>
  )
}

export function BrandBrainClient({
  brandId,
  brandName,
  websiteUrl,
  canEdit,
  emailVerified,
}: {
  brandId: string
  brandName: string
  websiteUrl: string | null
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('brandBrain')
  const tc = useTranslations('common')
  const intl = INTL_UI[useLocale()]
  const queryClient = useQueryClient()
  const [url, setUrl] = useState(websiteUrl ?? '')
  const [crawlId, setCrawlId] = useState<string | null>(null)

  const profile = useQuery({
    queryKey: ['brand-profile', brandId],
    queryFn: () => api<ProfileView>(`/api/brands/${brandId}/profile`),
  })

  const crawl = useQuery({
    queryKey: ['brand-crawl', brandId, crawlId],
    queryFn: () => api<CrawlView>(`/api/brands/${brandId}/analysis/${crawlId}`),
    enabled: Boolean(crawlId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'queued' || s === 'running' ? 2000 : false
    },
  })

  const crawlStatus = crawl.data?.status
  useEffect(() => {
    if (crawlStatus === 'succeeded' || crawlStatus === 'partial') {
      void queryClient.invalidateQueries({ queryKey: ['brand-profile', brandId] })
    }
  }, [crawlStatus, brandId, queryClient])

  const analyze = useMutation({
    mutationFn: () =>
      api<AnalyzeResult>(`/api/brands/${brandId}/analyze`, {
        method: 'POST',
        json: { websiteUrl: url || undefined },
        idempotent: true,
      }),
    onSuccess: (r) => setCrawlId(r.crawlId),
  })
  const cancel = useMutation({
    mutationFn: () => api<CrawlView>(`/api/brands/${brandId}/analysis/${crawlId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-crawl', brandId, crawlId] }),
  })
  const restore = useMutation({
    mutationFn: (version: number) =>
      api<ProfileView>(`/api/brands/${brandId}/profile/restore`, { method: 'POST', json: { version } }),
    onSuccess: (data) => queryClient.setQueryData(['brand-profile', brandId], data),
  })
  const unlock = useMutation({
    mutationFn: (path: FieldPath) =>
      api<ProfileView>(`/api/brands/${brandId}/profile/unlock`, { method: 'POST', json: { paths: [path] } }),
    onSuccess: (data) => queryClient.setQueryData(['brand-profile', brandId], data),
  })
  const save = useMutation({
    mutationFn: (changes: Array<{ path: FieldPath; value: unknown }>) =>
      api<ProfileView>(`/api/brands/${brandId}/profile`, { method: 'PATCH', json: { changes } }),
    onSuccess: (data) => queryClient.setQueryData(['brand-profile', brandId], data),
  })

  const running = crawlStatus === 'queued' || crawlStatus === 'running'
  const crawlDone = crawlStatus === 'succeeded' || crawlStatus === 'partial'
  const p = profile.data?.profile
  const locked = new Set(profile.data?.lockedFields ?? [])
  const isLocked = (path: FieldPath) => locked.has(path)
  const onUnlock = canEdit ? (path: FieldPath) => unlock.mutate(path) : undefined
  // izmena na mestu: jedno polje, nova verzija profila, polje se zaključava
  const onSave = canEdit
    ? async (path: FieldPath, value: unknown) => {
        await save.mutateAsync([{ path, value }])
      }
    : undefined
  const marketLabel = (m: string) => t(`audience.markets.${m as 'b2b' | 'b2c' | 'both' | 'unknown'}`)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle', { brand: brandName })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('analysis.title')}</CardTitle>
          <CardDescription>{t('analysis.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="websiteUrl">{t('analysis.url')}</Label>
              <Input
                id="websiteUrl"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('analysis.placeholder')}
                disabled={running}
              />
            </div>
            <Button
              onClick={() => analyze.mutate()}
              disabled={!canEdit || !emailVerified || running || analyze.isPending || !url.trim()}
            >
              {running
                ? t('analysis.running')
                : profile.data?.exists
                  ? t('analysis.again')
                  : t('analysis.start')}
            </Button>
            {running ? (
              <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {tc('cancel')}
              </Button>
            ) : null}
          </div>
          {!emailVerified ? (
            <p className="text-sm text-muted-foreground">{t('analysis.verifyEmail')}</p>
          ) : null}
          {!canEdit ? <p className="text-sm text-muted-foreground">{t('analysis.viewOnly')}</p> : null}
          <ErrorBox error={analyze.error ?? cancel.error} />

          {crawl.data ? (
            <div
              className={cn(
                'space-y-2 rounded-md border p-3 text-sm',
                // gotova analiza zelenim, neuspela crvenim okvirom
                crawlDone && 'border-success/40 bg-success/10',
                crawl.data.status === 'failed' && 'border-destructive/40 bg-destructive/10',
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn('inline-flex items-center gap-1.5 font-medium', crawlDone && 'text-success')}
                >
                  {crawlDone ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : null}
                  {crawl.data.progress?.message ?? crawl.data.status}
                </span>
                <span className="text-muted-foreground">
                  {t('analysis.pages', {
                    fetched: crawl.data.pagesFetched,
                    found: crawl.data.pagesFound || '?',
                    status: crawl.data.status,
                  })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted" aria-hidden>
                <div
                  className={cn('h-full transition-all', crawlDone ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${crawlDone ? 100 : (crawl.data.progress?.percent ?? 0)}%` }}
                />
              </div>
              {crawl.data.status === 'failed' && crawl.data.errorMessage ? (
                <p className="text-destructive">{crawl.data.errorMessage}</p>
              ) : null}
              {crawl.data.progress?.summary?.notes?.length ? (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {crawl.data.progress.summary.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {crawl.data.pages.length ? (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">
                    {t('analysis.readPages', { count: crawl.data.pages.length })}
                  </summary>
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">
                    {crawl.data.pages.map((pg) => (
                      <li key={pg.id} className="truncate">
                        <span className="text-muted-foreground">[{pg.type}]</span> {pg.title ?? pg.url}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {profile.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {profile.isError ? <ErrorBox error={profile.error} /> : null}

      {profile.data && !profile.data.exists ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('profile.missing')}
          </CardContent>
        </Card>
      ) : null}

      {profile.data && p && profile.data.exists ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{t('profile.version', { version: profile.data.version ?? '' })}</Badge>
            <Badge variant="secondary">
              {t('profile.source', { source: t(`generated.${p.meta.generated_by}`) })}
            </Badge>
            {p.meta.model ? <Badge variant="outline">{p.meta.model}</Badge> : null}
            <Badge variant="outline">
              {t('profile.confidence', { value: Math.round(p.meta.overall_confidence * 100) })}
            </Badge>
            <Badge variant="outline">{t('profile.chunks', { count: profile.data.knowledgeChunks })}</Badge>
          </div>
          {canEdit ? <p className="text-sm text-muted-foreground">{t('profile.editHint')}</p> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('identity.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('identity.name')}
                  field={p.identity.name}
                  path="identity.name"
                  locked={isLocked('identity.name')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.identity.name.value, required: true }}
                  onSave={onSave}
                >
                  <Text value={p.identity.name.value} />
                </FieldRow>
                <FieldRow
                  label={t('identity.tagline')}
                  field={p.identity.tagline}
                  path="identity.tagline"
                  locked={isLocked('identity.tagline')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.identity.tagline.value }}
                  onSave={onSave}
                >
                  <Text value={p.identity.tagline.value} />
                </FieldRow>
                <FieldRow
                  label={t('identity.description')}
                  field={p.identity.description}
                  path="identity.description"
                  locked={isLocked('identity.description')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.identity.description.value, multiline: true }}
                  onSave={onSave}
                >
                  <Text value={p.identity.description.value} />
                </FieldRow>
                <FieldRow
                  label={t('identity.industry')}
                  field={p.identity.industry}
                  path="identity.industry"
                  locked={isLocked('identity.industry')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.identity.industry.value }}
                  onSave={onSave}
                >
                  <Text value={p.identity.industry.value} />
                </FieldRow>
                <FieldRow
                  label={t('identity.location')}
                  field={p.identity.location}
                  path="identity.location"
                  locked={isLocked('identity.location')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'location', value: p.identity.location.value }}
                  onSave={onSave}
                >
                  <Text
                    value={
                      [p.identity.location.value.city, p.identity.location.value.country]
                        .filter(Boolean)
                        .join(', ') || null
                    }
                  />
                </FieldRow>
                <FieldRow
                  label={t('identity.contentLocale')}
                  field={p.identity.content_locale}
                  path="identity.content_locale"
                  locked={isLocked('identity.content_locale')}
                  onUnlock={onUnlock}
                >
                  <Text value={p.identity.content_locale.value} />
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('offer.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('offer.services')}
                  field={p.offer.services}
                  path="offer.services"
                  locked={isLocked('offer.services')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'pairs', value: p.offer.services.value }}
                  onSave={onSave}
                >
                  <List
                    items={p.offer.services.value.map((s) =>
                      s.description ? `${s.name}: ${s.description}` : s.name,
                    )}
                  />
                </FieldRow>
                <FieldRow
                  label={t('offer.products')}
                  field={p.offer.products}
                  path="offer.products"
                  locked={isLocked('offer.products')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'pairs', value: p.offer.products.value }}
                  onSave={onSave}
                >
                  <List items={p.offer.products.value.map((s) => s.name)} />
                </FieldRow>
                <FieldRow
                  label={t('offer.differentiators')}
                  field={p.offer.differentiators}
                  path="offer.differentiators"
                  locked={isLocked('offer.differentiators')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.offer.differentiators.value }}
                  onSave={onSave}
                >
                  <List items={p.offer.differentiators.value} />
                </FieldRow>
                <FieldRow
                  label={t('offer.prices')}
                  field={p.offer.price_hints}
                  path="offer.price_hints"
                  locked={isLocked('offer.price_hints')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.offer.price_hints.value }}
                  onSave={onSave}
                >
                  <List items={p.offer.price_hints.value} />
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('voice.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('voice.tone')}
                  field={p.voice.tone}
                  path="voice.tone"
                  locked={isLocked('voice.tone')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.voice.tone.value, comma: true }}
                  onSave={onSave}
                >
                  <Text value={p.voice.tone.value.join(', ') || null} />
                </FieldRow>
                <FieldRow
                  label={t('voice.address')}
                  field={p.voice.address}
                  path="voice.address"
                  locked={isLocked('voice.address')}
                  onUnlock={onUnlock}
                  edit={{
                    kind: 'choice',
                    value: p.voice.address.value,
                    options: [
                      { value: 'vi', label: t('voice.formal') },
                      { value: 'ti', label: t('voice.informal') },
                    ],
                  }}
                  onSave={onSave}
                >
                  <Text value={p.voice.address.value === 'ti' ? t('voice.informal') : t('voice.formal')} />
                </FieldRow>
                <FieldRow
                  label={t('voice.emoji')}
                  field={p.voice.emoji}
                  path="voice.emoji"
                  locked={isLocked('voice.emoji')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'bool', value: p.voice.emoji.value, label: t('voice.emojiAllowed') }}
                  onSave={onSave}
                >
                  <Text value={p.voice.emoji.value} />
                </FieldRow>
                <FieldRow
                  label={t('voice.samples')}
                  field={p.voice.sample_phrases}
                  path="voice.sample_phrases"
                  locked={isLocked('voice.sample_phrases')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.voice.sample_phrases.value }}
                  onSave={onSave}
                >
                  <List items={p.voice.sample_phrases.value} />
                </FieldRow>
                <FieldRow
                  label={t('voice.forbidden')}
                  field={p.voice.forbidden_words}
                  path="voice.forbidden_words"
                  locked={isLocked('voice.forbidden_words')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.voice.forbidden_words.value, comma: true }}
                  onSave={onSave}
                >
                  <Text value={p.voice.forbidden_words.value.join(', ') || null} />
                </FieldRow>
                <FieldRow
                  label={t('voice.hashtags')}
                  field={p.voice.hashtags}
                  path="voice.hashtags"
                  locked={isLocked('voice.hashtags')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.voice.hashtags.value }}
                  onSave={onSave}
                >
                  <Text value={p.voice.hashtags.value.join(' ') || null} />
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('audience.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('audience.segments')}
                  field={p.audience.segments}
                  path="audience.segments"
                  locked={isLocked('audience.segments')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'pairs', value: p.audience.segments.value }}
                  onSave={onSave}
                >
                  <List
                    items={p.audience.segments.value.map((s) =>
                      s.description ? `${s.name}: ${s.description}` : s.name,
                    )}
                  />
                </FieldRow>
                <FieldRow
                  label={t('audience.pains')}
                  field={p.audience.pain_points}
                  path="audience.pain_points"
                  locked={isLocked('audience.pain_points')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.audience.pain_points.value }}
                  onSave={onSave}
                >
                  <List items={p.audience.pain_points.value} />
                </FieldRow>
                <FieldRow
                  label={t('audience.market')}
                  field={p.audience.market}
                  path="audience.market"
                  locked={isLocked('audience.market')}
                  onUnlock={onUnlock}
                  edit={{
                    kind: 'choice',
                    value: p.audience.market.value,
                    options: (['b2b', 'b2c', 'both', 'unknown'] as const).map((m) => ({
                      value: m,
                      label: marketLabel(m),
                    })),
                  }}
                  onSave={onSave}
                >
                  <Text value={marketLabel(p.audience.market.value)} />
                </FieldRow>
                <FieldRow
                  label={t('audience.facts')}
                  field={p.facts}
                  path="facts"
                  locked={isLocked('facts')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'facts', value: p.facts.value }}
                  onSave={onSave}
                >
                  <List items={p.facts.value.map((f) => f.claim)} />
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('visual.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('visual.logo')}
                  // vaš logo nije nađen na sajtu: bez pouzdanosti i izvora analize
                  field={
                    profile.data.logoSource === 'custom'
                      ? { ...p.visual.logo, confidence: 1, source_urls: [] }
                      : p.visual.logo
                  }
                  path="visual.logo"
                  locked={false}
                >
                  <ProfileLogo
                    brandId={brandId}
                    logoUrl={profile.data.logoUrl}
                    source={profile.data.logoSource}
                    canEdit={canEdit}
                  />
                </FieldRow>
                <FieldRow
                  label={t('visual.colors')}
                  field={p.visual.colors}
                  path="visual.colors"
                  locked={isLocked('visual.colors')}
                  onUnlock={onUnlock}
                >
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['primary', p.visual.colors.value.primary],
                        ['secondary', p.visual.colors.value.secondary],
                        ['accent', p.visual.colors.value.accent],
                        ['light', p.visual.colors.value.neutral_light],
                        ['dark', p.visual.colors.value.neutral_dark],
                      ] as const
                    ).map(([name, hex]) => (
                      <span key={name} className="inline-flex items-center gap-1 text-xs">
                        <span
                          className="inline-block size-5 rounded border"
                          style={{ backgroundColor: hex }}
                          aria-hidden
                        />
                        {t(`colors.${name}`)} {hex}
                      </span>
                    ))}
                  </div>
                </FieldRow>
                <FieldRow
                  label={t('visual.fonts')}
                  field={p.visual.fonts}
                  path="visual.fonts"
                  locked={isLocked('visual.fonts')}
                  onUnlock={onUnlock}
                >
                  <Text
                    value={t('visual.fontsValue', {
                      headings: p.visual.fonts.value.headings ?? '?',
                      mappedHeadings: p.visual.fonts.value.mapped_headings,
                      body: p.visual.fonts.value.body ?? '?',
                      mappedBody: p.visual.fonts.value.mapped_body,
                    })}
                  />
                </FieldRow>
                <FieldRow
                  label={t('visual.photoStyle')}
                  field={p.visual.photo_style}
                  path="visual.photo_style"
                  locked={isLocked('visual.photo_style')}
                  onUnlock={onUnlock}
                >
                  {p.visual.photo_style.value ? (
                    <div className="space-y-1">
                      <p>{p.visual.photo_style.value.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('visual.photoDetails', {
                          lighting: p.visual.photo_style.value.lighting,
                          mood: p.visual.photo_style.value.mood,
                          people: p.visual.photo_style.value.has_people ? t('yes') : t('no'),
                        })}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{t('visual.notAssessed')}</span>
                  )}
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('contact.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldRow
                  label={t('contact.email')}
                  field={p.contact.email}
                  path="contact.email"
                  locked={isLocked('contact.email')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.contact.email.value }}
                  onSave={onSave}
                >
                  <Text value={p.contact.email.value} />
                </FieldRow>
                <FieldRow
                  label={t('contact.phone')}
                  field={p.contact.phone}
                  path="contact.phone"
                  locked={isLocked('contact.phone')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.contact.phone.value }}
                  onSave={onSave}
                >
                  <Text value={p.contact.phone.value} />
                </FieldRow>
                <FieldRow
                  label={t('contact.address')}
                  field={p.contact.address}
                  path="contact.address"
                  locked={isLocked('contact.address')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'text', value: p.contact.address.value }}
                  onSave={onSave}
                >
                  <Text value={p.contact.address.value} />
                </FieldRow>
                <FieldRow
                  label={t('contact.social')}
                  field={p.social}
                  path="social"
                  locked={isLocked('social')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'social', value: p.social.value }}
                  onSave={onSave}
                >
                  <List items={Object.entries(p.social.value).map(([k, v]) => `${k}: ${v}`)} />
                </FieldRow>
                <FieldRow
                  label={t('contact.blogTopics')}
                  field={p.content.blog_topics}
                  path="content.blog_topics"
                  locked={isLocked('content.blog_topics')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'lines', value: p.content.blog_topics.value }}
                  onSave={onSave}
                >
                  <List items={p.content.blog_topics.value.slice(0, 10)} />
                </FieldRow>
                <FieldRow
                  label={t('contact.pillars')}
                  field={p.content.content_pillars}
                  path="content.content_pillars"
                  locked={isLocked('content.content_pillars')}
                  onUnlock={onUnlock}
                  edit={{ kind: 'pairs', value: p.content.content_pillars.value, requiredDescription: true }}
                  onSave={onSave}
                >
                  <List items={p.content.content_pillars.value.map((c) => `${c.name}: ${c.description}`)} />
                </FieldRow>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('versions.title')}</CardTitle>
              <CardDescription>{t('versions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ErrorBox error={restore.error ?? unlock.error} />
              <ul className="divide-y text-sm">
                {profile.data.versions.map((v) => (
                  <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      v{v.version} · {t(`generated.${v.generatedBy}`)}
                      {v.model ? ` (${v.model})` : ''} · {new Date(v.createdAt).toLocaleString(intl)} ·{' '}
                      {t('versions.confidence', { value: Math.round(v.overallConfidence * 100) })}
                    </span>
                    {v.isCurrent ? (
                      <Badge>{t('versions.current')}</Badge>
                    ) : canEdit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restore.mutate(v.version)}
                        disabled={restore.isPending}
                      >
                        {t('versions.restore')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
