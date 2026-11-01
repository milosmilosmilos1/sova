'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { previewUrl, StylePicker } from '@/components/design/style-picker'
import { NetworkName } from '@/components/shared/network-badge'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORM_KEYS, PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { formatsForPlatforms, mediaNeed, type PostFormat, type PostFormatChoice } from '@/config/post-formats'
import type { ApiResponse } from '@/lib/api/response'
import {
  PHOTO_SOURCES,
  SLIDES_MAX,
  SLIDES_MIN,
  type PhotoSource,
  type PostSize,
  type StyleId,
} from '@/lib/visuals/design/catalog'
import type { DesignColors } from '@/lib/visuals/design/types'
import { uploadMediaFile } from '@/lib/media/client-upload'

/**
 * Ručni alati Studija: forma „Nova objava” i alati iz prve verzije (brif, faza 5). Od D-116 je
 * glavni Studio razgovor (`studio-chat.tsx`), a ovi alati su na /app/studio/tools.
 */
interface Balance {
  balance: { total: number; reserved: number; available: number }
  prices: Record<string, number>
}

interface TextResult {
  generationId: string
  model: string
  fallbackUsed: boolean
  tokensCharged: number
  output: {
    image_description: string | null
    variants: Array<{
      platform: string
      hook: string
      body: string
      cta: string
      hashtags: string[]
      alt_text: string
      first_comment: string | null
    }>
  }
  validation: Record<string, { ok: boolean; length: number; max: number; problems: string[] }>
}

interface JobView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  tokensCharged: number
  errorMessage: string | null
  progress: { message?: string } | null
  assetUrl: string | null
  assetId: string | null
  model: string | null
  output: { template?: string; attribution?: string | null; notes?: string[] } | null
}

interface UnsplashSearch {
  configured: boolean
  total: number
  results: Array<{
    id: string
    preview: string
    thumb: string
    alt: string | null
    photographer: string
    attribution: {
      text: string
      html: string
      photographerName: string
      photographerUrl: string
      unsplashUrl: string
    }
  }>
}

interface CanvaStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
}

interface UploadResult {
  id: string
  url: string
  width: number | null
  height: number | null
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

const ASPECTS = ['1:1', '4:5', '9:16', '16:9', '3:4', '4:3'] as const

export function StudioClient({
  workspaceId,
  brandId,
  brandName,
  brandLocale,
  sources,
  aiImages,
}: {
  workspaceId: string
  brandId: string
  brandName: string
  /** jezik sadržaja brenda, podrazumevan u „Novoj objavi” */
  brandLocale: string
  /** koji izvori vizuala imaju ključ (D-107) */
  sources: { unsplash: boolean; pexels: boolean }
  /** AI slike kroz Gemini; podrazumevano isključene (D-104) */
  aiImages: boolean
}) {
  const t = useTranslations('studioTools')
  const queryClient = useQueryClient()
  const balance = useQuery({
    queryKey: ['tokens', workspaceId],
    queryFn: () => api<Balance>(`/api/tokens/balance?workspaceId=${workspaceId}`),
    // tokeni se troše i u drugim tabovima i kroz Autopilot (EDGE_CASES T2)
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
  const refreshBalance = () => queryClient.invalidateQueries({ queryKey: ['tokens', workspaceId] })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app/studio" className="text-sm text-primary hover:underline">
            {t('back')}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('brand', { brand: brandName })}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-sm">
          {balance.isPending ? t('balance.loading') : null}
          {balance.isError ? <span className="text-destructive">{t('balance.error')}</span> : null}
          {balance.data ? (
            <>
              {t.rich('balance.available', {
                count: balance.data.balance.available,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
              {balance.data.balance.reserved
                ? ` ${t('balance.reserved', { count: balance.data.balance.reserved })}`
                : ''}
            </>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="compose">
        <TabsList className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="compose" className="flex-none">
            {t('tabs.compose')}
          </TabsTrigger>
          <TabsTrigger value="text" className="flex-none">
            {t('tabs.text', { price: balance.data?.prices.text ?? 2 })}
          </TabsTrigger>
          <TabsTrigger value="template" className="flex-none">
            {t('tabs.template', { price: balance.data?.prices.visual_template ?? 2 })}
          </TabsTrigger>
          <TabsTrigger value="unsplash" className="flex-none">
            {t('tabs.unsplash')}
          </TabsTrigger>
          <TabsTrigger value="pexels" className="flex-none">
            {t('tabs.pexels')}
          </TabsTrigger>
          <TabsTrigger value="canva" className="flex-none">
            {t('tabs.canva', { price: balance.data?.prices.canva_export ?? 2 })}
          </TabsTrigger>
          {aiImages ? (
            <>
              <TabsTrigger value="photo" className="flex-none">
                {t('tabs.photo', { price: balance.data?.prices.image_standard ?? 8 })}
              </TabsTrigger>
              <TabsTrigger value="prompt" className="flex-none">
                {t('tabs.prompt', { price: balance.data?.prices.image_standard ?? 8 })}
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <TabsContent value="compose">
          <ComposePanel
            brandId={brandId}
            brandLocale={brandLocale}
            sources={sources}
            prices={balance.data?.prices}
            onDone={refreshBalance}
          />
        </TabsContent>
        <TabsContent value="template">
          <VisualPanel workspaceId={workspaceId} brandId={brandId} onDone={refreshBalance} />
        </TabsContent>
        <TabsContent value="text">
          <TextPanel brandId={brandId} onDone={refreshBalance} />
        </TabsContent>
        <TabsContent value="unsplash">
          <UnsplashPanel brandId={brandId} />
        </TabsContent>
        <TabsContent value="pexels">
          <PexelsPanel brandId={brandId} />
        </TabsContent>
        <TabsContent value="canva">
          <CanvaImportPanel
            workspaceId={workspaceId}
            brandId={brandId}
            price={balance.data?.prices.canva_export ?? 2}
            onDone={refreshBalance}
          />
        </TabsContent>
        {aiImages ? (
          <>
            <TabsContent value="photo">
              <ImagePanel workspaceId={workspaceId} brandId={brandId} mode="photo" onDone={refreshBalance} />
            </TabsContent>
            <TabsContent value="prompt">
              <ImagePanel workspaceId={workspaceId} brandId={brandId} mode="prompt" onDone={refreshBalance} />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  )
}

function PhotoUpload({
  brandId,
  value,
  onChange,
}: {
  brandId: string
  value: UploadResult | null
  onChange: (asset: UploadResult | null) => void
}) {
  const t = useTranslations('studioTools')
  const upload = useMutation({
    // pravo u skladište (D-082); Vercel funkcija ne prima telo veće od 4,5 MB
    mutationFn: (file: File): Promise<UploadResult> => uploadMediaFile(file, { brandId }),
    onSuccess: (asset) => onChange(asset),
  })
  return (
    <div className="space-y-2">
      <Label htmlFor={`photo-${brandId}`}>{t('upload.label')}</Label>
      <Input
        id={`photo-${brandId}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={upload.isPending}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload.mutate(f)
        }}
      />
      {upload.isPending ? <p className="text-sm text-muted-foreground">{t('upload.uploading')}</p> : null}
      <ErrorBox error={upload.error} />
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt={t('upload.alt')} className="h-24 rounded-md border object-cover" />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t('upload.remove')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TextPanel({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const t = useTranslations('studioTools')
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'facebook'])
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState('engagement')
  const [variants, setVariants] = useState<1 | 2 | 3>(1)
  const [photo, setPhoto] = useState<UploadResult | null>(null)

  const generate = useMutation({
    mutationFn: () =>
      api<TextResult>('/api/ai/text', {
        method: 'POST',
        idempotent: true,
        json: {
          brandId,
          platforms,
          topic,
          goal,
          variantsPerPlatform: variants,
          includeHashtags: true,
          mediaAssetId: photo?.id,
        },
      }),
    onSuccess: onDone,
    onError: onDone,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('text.title')}</CardTitle>
        <CardDescription>{t('text.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-sm font-medium">{t('networks')}</legend>
          {PLATFORM_KEYS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={platforms.includes(p)}
                onChange={(e) =>
                  setPlatforms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))
                }
              />
              <NetworkName platform={p} />
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="topic">{t('topic')}</Label>
          <Textarea
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t('text.topicPlaceholder')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="goal">{t('goal')}</Label>
            <select
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="engagement">{t('goals.engagement')}</option>
              <option value="awareness">{t('goals.awareness')}</option>
              <option value="sales">{t('goals.sales')}</option>
              <option value="education">{t('goals.education')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variants">{t('text.variants')}</Label>
            <select
              id="variants"
              value={variants}
              onChange={(e) => setVariants(Number(e.target.value) as 1 | 2 | 3)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={1}>1</option>
              <option value={2}>2 (A/B)</option>
              <option value={3}>3</option>
            </select>
          </div>
        </div>
        <PhotoUpload brandId={brandId} value={photo} onChange={setPhoto} />
        <Button
          disabled={generate.isPending || platforms.length === 0 || topic.trim().length < 3}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? t('generating') : t('generate')}
        </Button>
        <ErrorBox error={generate.error} />
        {generate.data ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('text.model', { model: generate.data.model })}
              {generate.data.fallbackUsed ? ' (fallback)' : ''} ·{' '}
              {t('charged', { count: generate.data.tokensCharged })}
            </p>
            {generate.data.output.image_description ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                {t('text.photo', { description: generate.data.output.image_description })}
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {generate.data.output.variants.map((v, i) => {
                const val = Object.values(generate.data.validation)[i]
                return (
                  <div key={i} className="space-y-2 rounded-lg border p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <strong>{PLATFORMS[v.platform as keyof typeof PLATFORMS]?.label ?? v.platform}</strong>
                      {val ? (
                        <span className={val.ok ? 'text-xs text-success' : 'text-xs text-destructive'}>
                          {val.length}/{val.max}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium whitespace-pre-wrap">{v.hook}</p>
                    <p className="whitespace-pre-wrap">{v.body}</p>
                    <p className="whitespace-pre-wrap">{v.cta}</p>
                    {v.hashtags.length ? (
                      <p className="text-muted-foreground">{v.hashtags.join(' ')}</p>
                    ) : null}
                    {v.first_comment ? (
                      <p className="text-xs text-muted-foreground">
                        {t('text.firstComment', { text: v.first_comment })}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Alt: {v.alt_text}</p>
                    {val && !val.ok ? (
                      <p className="text-xs text-destructive">{val.problems.join(' ')}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ImagePanel({
  workspaceId,
  brandId,
  mode,
  onDone,
}: {
  workspaceId: string
  brandId: string
  mode: 'photo' | 'prompt'
  onDone: () => void
}) {
  const t = useTranslations('studioTools')
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>('1:1')
  const [quality, setQuality] = useState<'standard' | 'premium'>('standard')
  const [photo, setPhoto] = useState<UploadResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: () =>
      mode === 'photo'
        ? api<{ generationId: string }>('/api/ai/image/from-photo', {
            method: 'POST',
            idempotent: true,
            json: { brandId, mediaAssetId: photo?.id, instruction: prompt, aspectRatio: aspect, quality },
          })
        : api<{ generationId: string }>('/api/ai/image/from-prompt', {
            method: 'POST',
            idempotent: true,
            json: { brandId, prompt, aspectRatio: aspect, quality },
          }),
    onSuccess: (d) => {
      setJobId(d.generationId)
      onDone()
    },
    onError: onDone,
  })

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<JobView>(`/api/ai/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && (s === 'succeeded' || s === 'failed' || s === 'canceled') ? false : 2000
    },
  })
  const doneRef = useRef<string | null>(null)
  useEffect(() => {
    const s = job.data?.status
    if (job.data && (s === 'succeeded' || s === 'failed') && doneRef.current !== job.data.id) {
      doneRef.current = job.data.id
      onDone()
    }
  }, [job.data, onDone])

  const canStart = prompt.trim().length >= 3 && (mode === 'prompt' || photo) && !start.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'photo' ? t('image.photoTitle') : t('image.promptTitle')}</CardTitle>
        <CardDescription>
          {mode === 'photo' ? t('image.photoDescription') : t('image.promptDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'photo' ? <PhotoUpload brandId={brandId} value={photo} onChange={setPhoto} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor={`prompt-${mode}`}>
            {mode === 'photo' ? t('image.photoPrompt') : t('image.promptLabel')}
          </Label>
          <Textarea
            id={`prompt-${mode}`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`aspect-${mode}`}>{t('format')}</Label>
            <select
              id={`aspect-${mode}`}
              value={aspect}
              onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`quality-${mode}`}>{t('image.quality')}</Label>
            <select
              id={`quality-${mode}`}
              value={quality}
              onChange={(e) => setQuality(e.target.value as 'standard' | 'premium')}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="standard">{t('image.standard')}</option>
              <option value="premium">{t('image.premium')}</option>
            </select>
          </div>
        </div>
        <Button disabled={!canStart} onClick={() => start.mutate()}>
          {start.isPending ? t('sending') : t('generate')}
        </Button>
        <ErrorBox error={start.error} />
        {jobId ? (
          <div className="space-y-2">
            {job.isPending ? <p className="text-sm text-muted-foreground">{t('image.waiting')}</p> : null}
            <ErrorBox error={job.error} />
            {job.data && (job.data.status === 'queued' || job.data.status === 'running') ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t('image.refreshing', { message: job.data.progress?.message ?? t('queued') })}
              </p>
            ) : null}
            {job.data?.status === 'failed' ? (
              <ErrorBox error={new Error(job.data.errorMessage ?? t('image.failed'))} />
            ) : null}
            {job.data?.status === 'succeeded' && job.data.assetUrl ? (
              <figure className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.data.assetUrl}
                  alt={t('image.alt')}
                  className="max-h-[480px] rounded-lg border"
                />
                <figcaption className="text-xs text-muted-foreground">
                  {t('image.generated', { model: job.data.model ?? '' })} ·{' '}
                  {t('charged', { count: job.data.tokensCharged })}
                </figcaption>
                <CanvaActions workspaceId={workspaceId} brandId={brandId} assetId={job.data.assetId} />
              </figure>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const TEMPLATES = ['auto', 'photo-overlay', 'solid', 'split', 'announcement'] as const
const TEMPLATE_ASPECTS = ['1:1', '4:5', '9:16', '16:9', '3:4'] as const

function UnsplashPicker({
  value,
  onChange,
}: {
  value: { id: string; attribution: string } | null
  onChange: (v: { id: string; attribution: string } | null) => void
}) {
  const t = useTranslations('studioTools')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useQuery({
    queryKey: ['unsplash', submitted],
    queryFn: () =>
      api<UnsplashSearch>(`/api/unsplash/search?query=${encodeURIComponent(submitted)}&perPage=12`),
    enabled: submitted.length >= 2,
  })
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('unsplash.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(query.trim())}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setSubmitted(query.trim())}
          disabled={query.trim().length < 2}
        >
          {t('search')}
        </Button>
      </div>
      {search.isPending && submitted ? (
        <p className="text-sm text-muted-foreground">{t('unsplash.searching')}</p>
      ) : null}
      <ErrorBox error={search.error} />
      {search.data && !search.data.configured ? (
        <p className="text-sm text-muted-foreground">{t('unsplash.notConfigured')}</p>
      ) : null}
      {search.data?.configured && search.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noResults', { query: submitted })}</p>
      ) : null}
      {search.data?.results.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {search.data.results.map((p) => (
            <figure key={p.id} className="min-w-0 space-y-1">
              <button
                type="button"
                onClick={() => onChange({ id: p.id, attribution: p.attribution.text })}
                className={`block w-full overflow-hidden rounded-md border ${value?.id === p.id ? 'ring-2 ring-primary' : ''}`}
                title={`${p.alt ?? ''} · ${p.attribution.text}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb}
                  alt={p.alt ?? t('unsplash.photoAlt')}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </button>
              {/* Unsplash smernice: vidljivo ime fotografa i Unsplash, oba sa linkom (UTM) */}
              <figcaption className="truncate text-[11px] text-muted-foreground">
                <a
                  href={p.attribution.photographerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {p.attribution.photographerName}
                </a>{' '}
                ·{' '}
                <a
                  href={p.attribution.unsplashUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Unsplash
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {value ? (
        <p className="text-xs text-muted-foreground">
          {t('unsplash.selected', { attribution: value.attribution })}{' '}
          <button type="button" className="underline" onClick={() => onChange(null)}>
            {t('unsplash.remove')}
          </button>
        </p>
      ) : null}
    </div>
  )
}

function VisualPanel({
  workspaceId,
  brandId,
  onDone,
}: {
  workspaceId: string
  brandId: string
  onDone: () => void
}) {
  const t = useTranslations('studioTools')
  const [headline, setHeadline] = useState('')
  const [subtext, setSubtext] = useState('')
  const [cta, setCta] = useState('')
  const [aspect, setAspect] = useState<(typeof TEMPLATE_ASPECTS)[number]>('1:1')
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>('auto')
  const [source, setSource] = useState<'unsplash' | 'asset' | 'none'>('unsplash')
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; attribution: string } | null>(null)
  const [photo, setPhoto] = useState<UploadResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: () =>
      api<{ generationId: string }>('/api/ai/visual/template', {
        method: 'POST',
        idempotent: true,
        json: {
          brandId,
          headline,
          subtext: subtext || undefined,
          cta: cta || undefined,
          aspectRatio: aspect,
          template,
          image:
            source === 'none'
              ? { kind: 'none' }
              : source === 'asset'
                ? { kind: 'asset', mediaAssetId: photo?.id }
                : {
                    kind: 'unsplash',
                    photoId: picked?.id,
                    query: picked ? undefined : unsplashQuery || headline,
                  },
        },
      }),
    onSuccess: (d) => {
      setJobId(d.generationId)
      onDone()
    },
    onError: onDone,
  })
  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<JobView>(`/api/ai/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && (s === 'succeeded' || s === 'failed' || s === 'canceled') ? false : 2000
    },
  })
  const doneRef = useRef<string | null>(null)
  useEffect(() => {
    const s = job.data?.status
    if (job.data && (s === 'succeeded' || s === 'failed') && doneRef.current !== job.data.id) {
      doneRef.current = job.data.id
      onDone()
    }
  }, [job.data, onDone])

  const canStart = headline.trim().length >= 3 && !start.isPending && (source !== 'asset' || photo)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('visual.title')}</CardTitle>
        <CardDescription>{t('visual.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vt-headline">{t('visual.headline')}</Label>
          <Input
            id="vt-headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            placeholder={t('visual.headlinePlaceholder')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vt-subtext">{t('visual.subtext')}</Label>
            <Input
              id="vt-subtext"
              value={subtext}
              onChange={(e) => setSubtext(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-cta">{t('cta')}</Label>
            <Input
              id="vt-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              maxLength={40}
              placeholder={t('visual.ctaPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-aspect">{t('format')}</Label>
            <select
              id="vt-aspect"
              value={aspect}
              onChange={(e) => setAspect(e.target.value as (typeof TEMPLATE_ASPECTS)[number])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {TEMPLATE_ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-template">{t('visual.template')}</Label>
            <select
              id="vt-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value as (typeof TEMPLATES)[number])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {TEMPLATES.map((id) => (
                <option key={id} value={id}>
                  {t(`templates.${id}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('visual.image')}</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {(['unsplash', 'asset', 'none'] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="vt-source"
                  value={v}
                  checked={source === v}
                  onChange={() => setSource(v)}
                />
                {t(`visual.sources.${v}`)}
              </label>
            ))}
          </div>
          {source === 'unsplash' ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('visual.unsplashHint')}</p>
              <UnsplashPicker value={picked} onChange={setPicked} />
              {!picked ? (
                <Input
                  value={unsplashQuery}
                  onChange={(e) => setUnsplashQuery(e.target.value)}
                  placeholder={t('visual.queryPlaceholder')}
                />
              ) : null}
            </div>
          ) : null}
          {source === 'asset' ? <PhotoUpload brandId={brandId} value={photo} onChange={setPhoto} /> : null}
        </fieldset>
        <Button disabled={!canStart} onClick={() => start.mutate()}>
          {start.isPending ? t('sending') : t('visual.submit')}
        </Button>
        <ErrorBox error={start.error} />
        {jobId ? (
          <div className="space-y-2">
            {job.data && (job.data.status === 'queued' || job.data.status === 'running') ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {job.data.progress?.message ?? t('queued')}
              </p>
            ) : null}
            {job.data?.status === 'failed' ? (
              <ErrorBox error={new Error(job.data.errorMessage ?? t('visual.failed'))} />
            ) : null}
            {job.data?.status === 'succeeded' && job.data.assetUrl ? (
              <figure className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={job.data.assetUrl} alt={headline} className="max-h-[560px] rounded-lg border" />
                <figcaption className="text-xs text-muted-foreground">
                  {t('visual.templateUsed', { template: job.data.output?.template ?? '' })} ·{' '}
                  {t('charged', { count: job.data.tokensCharged })}
                  {job.data.output?.attribution ? ` · ${job.data.output.attribution}` : ''}
                  {job.data.output?.notes?.length ? ` · ${job.data.output.notes.join(' ')}` : ''}
                </figcaption>
                <CanvaActions workspaceId={workspaceId} brandId={brandId} assetId={job.data.assetId} />
              </figure>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CanvaActions({
  workspaceId,
  brandId,
  assetId,
}: {
  workspaceId: string
  brandId: string
  assetId: string | null
}) {
  const t = useTranslations('studioTools')
  const status = useQuery({
    queryKey: ['canva-status', workspaceId],
    queryFn: () => api<CanvaStatus>(`/api/canva/status?workspaceId=${workspaceId}`),
  })
  const [designId, setDesignId] = useState<string | null>(null)
  const design = useMutation({
    mutationFn: () =>
      api<{ design: { id: string; editUrl: string } }>('/api/canva/designs', {
        method: 'POST',
        idempotent: true,
        json: { brandId, mediaAssetId: assetId ?? undefined },
      }),
    onSuccess: (d) => {
      setDesignId(d.design.id)
      window.open(d.design.editUrl, '_blank', 'noopener')
    },
  })
  const exp = useMutation({
    mutationFn: () =>
      api<{ asset: { url: string } }>('/api/canva/export', {
        method: 'POST',
        idempotent: true,
        json: { brandId, designId, format: 'png' },
      }),
  })
  if (!status.data?.configured || !status.data.enabled) return null
  if (!status.data.connected) {
    return (
      <p className="text-xs text-muted-foreground">
        {t.rich('canva.prompt', {
          link: (chunks) => (
            <a
              className="underline"
              href={`/api/integrations/canva/connect?workspaceId=${workspaceId}&redirectTo=/app/studio`}
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => design.mutate()}
        disabled={design.isPending || !assetId}
      >
        {design.isPending ? t('canva.opening') : t('canva.edit')}
      </Button>
      {designId ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exp.mutate()}
          disabled={exp.isPending}
        >
          {exp.isPending ? t('canva.importing') : t('canva.importDesign')}
        </Button>
      ) : null}
      <ErrorBox error={design.error ?? exp.error} />
      {exp.data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={exp.data.asset.url} alt={t('canva.designAlt')} className="max-h-64 rounded-md border" />
      ) : null}
    </div>
  )
}

interface UnsplashSelected {
  id: string
  url: string
  altText: string | null
  attribution: { text: string } | null
  reused: boolean
}

/** Fotografija bez šablona i bez AI-ja (D-104): kopija ide u biblioteku, objava je bira odande. */
function UnsplashPanel({ brandId }: { brandId: string }) {
  const t = useTranslations('studioTools')
  const [picked, setPicked] = useState<{ id: string; attribution: string } | null>(null)
  const select = useMutation({
    mutationFn: (photoId: string) =>
      api<UnsplashSelected>('/api/unsplash/select', { method: 'POST', json: { brandId, photoId } }),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('unsplashPanel.title')}</CardTitle>
        <CardDescription>{t('unsplashPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <UnsplashPicker
          value={picked}
          onChange={(v) => {
            setPicked(v)
            select.reset()
          }}
        />
        <Button disabled={!picked || select.isPending} onClick={() => picked && select.mutate(picked.id)}>
          {select.isPending ? t('saving') : t('addToLibrary')}
        </Button>
        <ErrorBox error={select.error} />
        {select.data ? (
          <figure className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={select.data.url}
              alt={select.data.altText ?? t('unsplashPanel.title')}
              className="max-h-80 rounded-lg border"
            />
            <figcaption className="text-xs text-muted-foreground">
              {select.data.reused ? t('unsplashPanel.reused') : t('addedToLibrary')}
              {select.data.attribution ? ` ${select.data.attribution.text}` : ''}
            </figcaption>
          </figure>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface CanvaDesignItem {
  id: string
  title: string | null
  thumbnail: { url: string; width: number; height: number } | null
}

/**
 * Uvoz gotovog dizajna iz Canve (D-104): slika odmah, video kao pozadinski posao. Šabloni,
 * fotografije i snimci iz Canve tako stižu u objave bez AI slika.
 */
function CanvaImportPanel({
  workspaceId,
  brandId,
  price,
  onDone,
}: {
  workspaceId: string
  brandId: string
  price: number
  onDone: () => void
}) {
  const t = useTranslations('studioTools')
  const status = useQuery({
    queryKey: ['canva-status', workspaceId],
    queryFn: () => api<CanvaStatus>(`/api/canva/status?workspaceId=${workspaceId}`),
  })
  const connected = Boolean(status.data?.configured && status.data.enabled && status.data.connected)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const designs = useInfiniteQuery({
    queryKey: ['canva-designs', workspaceId, submitted],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ workspaceId })
      if (submitted) params.set('query', submitted)
      if (pageParam) params.set('continuation', pageParam)
      return api<{ items: CanvaDesignItem[]; continuation: string | null }>(`/api/canva/designs?${params}`)
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.continuation ?? undefined,
    enabled: connected,
    // sličice iz Canve važe 15 minuta
    staleTime: 10 * 60_000,
  })
  const [selected, setSelected] = useState<CanvaDesignItem | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const image = useMutation({
    mutationFn: (designId: string) =>
      api<{ asset: { url: string } }>('/api/canva/export', {
        method: 'POST',
        idempotent: true,
        json: { brandId, designId, format: 'png' },
      }),
    onSettled: onDone,
  })
  const video = useMutation({
    mutationFn: (designId: string) =>
      api<{ generationId: string }>('/api/canva/export', {
        method: 'POST',
        idempotent: true,
        json: { brandId, designId, format: 'mp4' },
      }),
    onSuccess: (d) => setJobId(d.generationId),
    onSettled: onDone,
  })
  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<JobView>(`/api/ai/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && (s === 'succeeded' || s === 'failed' || s === 'canceled') ? false : 3000
    },
  })
  const doneRef = useRef<string | null>(null)
  useEffect(() => {
    const s = job.data?.status
    if (job.data && (s === 'succeeded' || s === 'failed') && doneRef.current !== job.data.id) {
      doneRef.current = job.data.id
      onDone()
    }
  }, [job.data, onDone])

  const items = designs.data?.pages.flatMap((p) => p.items) ?? []
  const videoRunning =
    Boolean(jobId) && (!job.data || job.data.status === 'queued' || job.data.status === 'running')
  const busy = image.isPending || video.isPending || videoRunning
  const choose = (d: CanvaDesignItem) => {
    if (busy) return
    setSelected(d)
    setJobId(null)
    image.reset()
    video.reset()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('canvaImport.title')}</CardTitle>
        <CardDescription>{t('canvaImport.description', { price })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? (
          <p className="text-sm text-muted-foreground">{t('canvaImport.checking')}</p>
        ) : null}
        <ErrorBox error={status.error} />
        {status.data && !status.data.configured ? (
          <p className="text-sm text-muted-foreground">{t('canvaImport.notConfigured')}</p>
        ) : null}
        {status.data?.configured && !status.data.enabled ? (
          <p className="text-sm text-muted-foreground">{t('canvaImport.disabled')}</p>
        ) : null}
        {status.data?.configured && status.data.enabled && !status.data.connected ? (
          <p className="text-sm">
            {t.rich('canvaImport.connect', {
              link: (chunks) => (
                <a
                  className="underline"
                  href={`/api/integrations/canva/connect?workspaceId=${workspaceId}&redirectTo=/app/studio`}
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : null}
        {connected ? (
          <>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('canvaImport.searchPlaceholder')}
                aria-label={t('canvaImport.searchLabel')}
                onKeyDown={(e) => e.key === 'Enter' && setSubmitted(query.trim())}
              />
              <Button type="button" variant="outline" onClick={() => setSubmitted(query.trim())}>
                {t('search')}
              </Button>
            </div>
            {designs.isPending ? (
              <p className="text-sm text-muted-foreground">{t('canvaImport.loading')}</p>
            ) : null}
            <ErrorBox error={designs.error} />
            {designs.data && items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {submitted ? t('canvaImport.noResults', { query: submitted }) : t('canvaImport.empty')}
              </p>
            ) : null}
            {items.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => choose(d)}
                    aria-pressed={selected?.id === d.id}
                    className="min-w-0 space-y-1 text-left"
                  >
                    <span
                      className={`block overflow-hidden rounded-md border bg-muted ${selected?.id === d.id ? 'ring-2 ring-primary' : ''}`}
                    >
                      {d.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.thumbnail.url}
                          alt=""
                          className="aspect-square w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                          {t('canvaImport.noThumb')}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs">{d.title ?? t('canvaImport.untitled')}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {designs.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => designs.fetchNextPage()}
                disabled={designs.isFetchingNextPage}
              >
                {designs.isFetchingNextPage ? t('loading') : t('canvaImport.more')}
              </Button>
            ) : null}
            {selected ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">{selected.title ?? t('canvaImport.untitled')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => image.mutate(selected.id)} disabled={busy}>
                    {image.isPending ? t('canvaImport.importingImage') : t('canvaImport.asImage', { price })}
                  </Button>
                  <Button variant="outline" onClick={() => video.mutate(selected.id)} disabled={busy}>
                    {video.isPending ? t('sending') : t('canvaImport.asVideo', { price })}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('canvaImport.hint')}</p>
                <ErrorBox error={image.error ?? video.error} />
                {image.data ? (
                  <figure className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.data.asset.url}
                      alt={selected.title ?? t('canva.designAlt')}
                      className="max-h-80 rounded-lg border"
                    />
                    <figcaption className="text-xs text-muted-foreground">
                      {t('canvaImport.saved')}
                    </figcaption>
                  </figure>
                ) : null}
                {videoRunning ? (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {job.data?.progress?.message ?? t('queued')}
                  </p>
                ) : null}
                {job.data?.status === 'failed' ? (
                  <ErrorBox error={new Error(job.data.errorMessage ?? t('canvaImport.videoFailed'))} />
                ) : null}
                {job.data?.status === 'succeeded' && job.data.assetUrl ? (
                  <figure className="space-y-2">
                    <video
                      src={job.data.assetUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-[480px] rounded-lg border bg-black"
                      aria-label={selected.title ?? t('canvaImport.videoLabel')}
                    />
                    <figcaption className="text-xs text-muted-foreground">
                      {t('canvaImport.videoDone')} · {t('charged', { count: job.data.tokensCharged })}
                    </figcaption>
                  </figure>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface PexelsResult {
  id: number
  kind: 'video' | 'photo'
  width: number
  height: number
  thumb: string
  durationSec: number | null
  attribution: { text: string; authorName: string; authorUrl: string; pageUrl: string }
}

interface PexelsSelected {
  id: string
  kind: 'image' | 'video'
  url: string
  attribution: { text: string } | null
  reused: boolean
}

/** Pexels (D-107): video snimci i fotografije bez AI-ja i bez tokena; kopija ide u biblioteku brenda. */
function PexelsPanel({ brandId }: { brandId: string }) {
  const t = useTranslations('studioTools')
  const [kind, setKind] = useState<'video' | 'photo'>('video')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [picked, setPicked] = useState<PexelsResult | null>(null)
  const search = useQuery({
    queryKey: ['pexels', kind, submitted],
    queryFn: () =>
      api<{ configured: boolean; results: PexelsResult[] }>(
        `/api/pexels/search?${new URLSearchParams({ query: submitted, kind })}`,
      ),
    enabled: submitted.length >= 2,
  })
  const select = useMutation({
    mutationFn: (p: PexelsResult) =>
      api<PexelsSelected>('/api/pexels/select', {
        method: 'POST',
        json: { brandId, id: p.id, kind: p.kind },
      }),
  })
  const choose = (p: PexelsResult | null) => {
    setPicked(p)
    select.reset()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pexels.title')}</CardTitle>
        <CardDescription>{t('pexels.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label={t('pexels.kind')}>
          {(['video', 'photo'] as const).map((v) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="pexels-kind"
                checked={kind === v}
                onChange={() => {
                  setKind(v)
                  choose(null)
                }}
              />
              {t(`pexels.${v}`)}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pexels.placeholder')}
            aria-label={t('pexels.searchLabel')}
            onKeyDown={(e) => e.key === 'Enter' && setSubmitted(query.trim())}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setSubmitted(query.trim())}
            disabled={query.trim().length < 2}
          >
            {t('search')}
          </Button>
        </div>
        {/* Pexels traži vidljiv link ka Pexels-u uz svaku pretragu, pored imena autora */}
        <p className="text-xs text-muted-foreground">
          {t.rich('pexels.credit', {
            link: (chunks) => (
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        {search.isPending && submitted ? (
          <p className="text-sm text-muted-foreground">{t('pexels.searching')}</p>
        ) : null}
        <ErrorBox error={search.error} />
        {search.data && !search.data.configured ? (
          <p className="text-sm text-muted-foreground">{t('pexels.notConfigured')}</p>
        ) : null}
        {search.data?.configured && search.data.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noResults', { query: submitted })}</p>
        ) : null}
        {search.data?.results.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {search.data.results.map((p) => (
              <figure key={`${p.kind}-${p.id}`} className="min-w-0 space-y-1">
                <button
                  type="button"
                  onClick={() => choose(p)}
                  aria-pressed={picked?.id === p.id}
                  className={`relative block w-full overflow-hidden rounded-md border ${picked?.id === p.id ? 'ring-2 ring-primary' : ''}`}
                  title={p.attribution.text}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumb}
                    alt={p.kind === 'video' ? t('pexels.videoAlt') : t('pexels.photoAlt')}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  {p.durationSec !== null ? (
                    <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 text-[11px] text-white">
                      {t('pexels.duration', { seconds: p.durationSec })}
                      {p.height > p.width ? ` · ${t('pexels.vertical')}` : ''}
                    </span>
                  ) : null}
                </button>
                <figcaption className="truncate text-[11px] text-muted-foreground">
                  <a
                    href={p.attribution.authorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {p.attribution.authorName}
                  </a>{' '}
                  ·{' '}
                  <a
                    href={p.attribution.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Pexels
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        <Button disabled={!picked || select.isPending} onClick={() => picked && select.mutate(picked)}>
          {select.isPending
            ? picked?.kind === 'video'
              ? t('pexels.downloading')
              : t('saving')
            : t('addToLibrary')}
        </Button>
        <ErrorBox error={select.error} />
        {select.data ? (
          <figure className="space-y-2">
            {select.data.kind === 'video' ? (
              <video
                src={select.data.url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[420px] rounded-lg border bg-black"
                aria-label={t('pexels.videoAlt')}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={select.data.url} alt={t('pexels.photoAlt')} className="max-h-80 rounded-lg border" />
            )}
            <figcaption className="text-xs text-muted-foreground">
              {select.data.reused ? t('pexels.reused') : t('addedToLibrary')}
              {select.data.attribution ? ` ${select.data.attribution.text}` : ''}
            </figcaption>
          </figure>
        ) : null}
      </CardContent>
    </Card>
  )
}

const COMPOSE_LOCALES = ['sr-Latn', 'sr-Cyrl', 'en', 'uk'] as const

interface ComposeView {
  postId: string
  format: PostFormat
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{ id: string; kind: string; url: string; attribution: string | null }>
  targets: number
  notes: string[]
  tokensCharged: number
  styleId?: string
}

interface BrandDesignView {
  styleId: StyleId
  size: PostSize
  photoSource: PhotoSource
  slides: number
  colors: DesignColors
}

/**
 * „Nova objava” (D-107): mreže, jezik, vrsta objave i izvor vizuala u jednom zahtevu. Gemini piše
 * tekst sa heštegovima, fotografije dolaze sa Unsplash-a ili Pexels-a, video sa Pexels-a, a
 * rezultat je nacrt objave koji se pregleda i zakazuje.
 */
function ComposePanel({
  brandId,
  brandLocale,
  sources,
  prices,
  onDone,
}: {
  brandId: string
  brandLocale: string
  sources: { unsplash: boolean; pexels: boolean }
  prices: Record<string, number> | undefined
  onDone: () => void
}) {
  const t = useTranslations('studioTools')
  const tl = useTranslations('contentLocale')
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['instagram', 'facebook'])
  const [locale, setLocale] = useState(brandLocale)
  const [format, setFormat] = useState<PostFormatChoice>('auto')
  const [source, setSource] = useState<'auto' | 'unsplash' | 'pexels' | 'template'>('auto')
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState('engagement')
  const [cta, setCta] = useState('')
  const [hashtags, setHashtags] = useState(true)
  const [linkUrl, setLinkUrl] = useState('')
  // dizajn u stilu brenda (D-108): stil, broj slajdova i izvor fotografija; podrazumevano iz dizajna brenda
  const td = useTranslations('design')
  const design = useQuery({
    queryKey: ['design', brandId],
    queryFn: () => api<BrandDesignView>(`/api/brands/${brandId}/design`),
  })
  const [look, setLook] = useState<'design' | 'photo'>('design')
  const [styleChoice, setStyleChoice] = useState<StyleId | null>(null)
  const [slidesChoice, setSlidesChoice] = useState<number | null>(null)
  const [photoChoice, setPhotoChoice] = useState<PhotoSource | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const styleId = styleChoice ?? design.data?.styleId ?? 'headline'
  const slides = slidesChoice ?? design.data?.slides ?? 5
  const photoSource = photoChoice ?? design.data?.photoSource ?? 'stock'
  const size = design.data?.size ?? 'portrait'

  const allowed = formatsForPlatforms(platforms)
  // vrsta koja ne ide na novo izabrane mreže vraća se na „AI bira”
  const chosen: PostFormatChoice = format !== 'auto' && !allowed.includes(format) ? 'auto' : format
  const needsVisual = chosen === 'auto' || mediaNeed(chosen).kind !== 'none'
  const designable = chosen === 'auto' || chosen === 'image' || chosen === 'carousel' || chosen === 'story'
  const designed = look === 'design' && designable && (chosen !== 'auto' || allowed.includes('image'))
  const textPrice = prices?.text ?? 2
  const cost =
    textPrice + (!designed && needsVisual && source === 'template' ? (prices?.visual_template ?? 2) : 0)
  const wantsVideo = chosen === 'video' || (chosen === 'auto' && allowed.includes('video'))

  const run = useMutation({
    mutationFn: () =>
      api<ComposeView>('/api/ai/compose', {
        method: 'POST',
        idempotent: true,
        json: {
          brandId,
          platforms,
          topic,
          goal,
          cta: cta.trim() || undefined,
          includeHashtags: hashtags,
          locale,
          format: chosen,
          source,
          linkUrl: chosen === 'link' && linkUrl.trim() ? linkUrl.trim() : undefined,
          design: designed,
          ...(designed
            ? {
                styleId,
                photoSource,
                slides: chosen === 'carousel' || chosen === 'auto' ? slides : undefined,
              }
            : {}),
        },
      }),
    onSettled: onDone,
  })

  const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('compose.title')}</CardTitle>
        <CardDescription>{t('compose.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-sm font-medium">{t('networks')}</legend>
          {PLATFORM_KEYS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={platforms.includes(p)}
                onChange={(e) =>
                  setPlatforms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))
                }
              />
              <NetworkName platform={p} />
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compose-locale">{t('compose.language')}</Label>
            <select
              id="compose-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className={selectClass}
            >
              {COMPOSE_LOCALES.map((v) => (
                <option key={v} value={v}>
                  {tl(v)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-format">{t('compose.format')}</Label>
            <select
              id="compose-format"
              value={chosen}
              onChange={(e) => setFormat(e.target.value as PostFormatChoice)}
              className={selectClass}
            >
              <option value="auto">{t('compose.formatAuto')}</option>
              {allowed.map((f) => (
                <option key={f} value={f}>
                  {t(`formats.${f}.label`)}
                </option>
              ))}
            </select>
          </div>
          {needsVisual && !designed ? (
            <div className="space-y-1.5">
              <Label htmlFor="compose-source">{t('compose.source')}</Label>
              <select
                id="compose-source"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
                className={selectClass}
              >
                <option value="auto">{t('compose.sourceAuto')}</option>
                <option value="unsplash">Unsplash</option>
                <option value="pexels">Pexels</option>
                <option value="template">
                  {t('compose.sourceTemplate', { count: prices?.visual_template ?? 2 })}
                </option>
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="compose-goal">{t('goal')}</Label>
            <select
              id="compose-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className={selectClass}
            >
              <option value="engagement">{t('goals.engagement')}</option>
              <option value="awareness">{t('goals.awareness')}</option>
              <option value="sales">{t('goals.sales')}</option>
              <option value="education">{t('goals.education')}</option>
            </select>
          </div>
        </div>

        {designable ? (
          <section className="space-y-3 rounded-lg border p-3">
            <div
              className="flex flex-wrap items-center gap-2"
              role="radiogroup"
              aria-label={t('compose.look')}
            >
              <span className="text-sm font-medium">{t('compose.look')}</span>
              {(['design', 'photo'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={look === v}
                  onClick={() => setLook(v)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${look === v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                >
                  {v === 'design' ? t('compose.lookDesign') : t('compose.lookPhoto')}
                </button>
              ))}
            </div>
            {designed ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dinamički pregled stila */}
                  <img
                    src={previewUrl({
                      brandId,
                      styleId,
                      format: chosen === 'story' ? 'story' : size,
                      colors: design.data?.colors,
                      photo: photoSource !== 'none',
                    })}
                    alt={td(`styles.${styleId}.name`)}
                    className={`w-20 rounded-md border object-cover ${chosen === 'story' ? 'aspect-[9/16]' : size === 'square' ? 'aspect-square' : 'aspect-[4/5]'}`}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">{td(`styles.${styleId}.name`)}</p>
                    <p className="text-xs text-muted-foreground">{td(`styles.${styleId}.desc`)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPickerOpen((o) => !o)}
                    aria-expanded={pickerOpen}
                  >
                    {pickerOpen ? t('compose.closeStyles') : t('compose.changeStyle')}
                  </Button>
                </div>
                {pickerOpen ? (
                  <StylePicker
                    brandId={brandId}
                    value={styleId}
                    onChange={(id) => {
                      setStyleChoice(id)
                      setPickerOpen(false)
                    }}
                    size={size}
                    colors={design.data?.colors}
                    photo={photoSource !== 'none'}
                    initialFormat={chosen === 'story' ? 'story' : chosen === 'image' ? 'post' : 'carousel'}
                  />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {chosen === 'carousel' || chosen === 'auto' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="compose-slides">{td('slides.label')}</Label>
                      <Input
                        id="compose-slides"
                        type="number"
                        min={SLIDES_MIN}
                        max={SLIDES_MAX}
                        value={slides}
                        onChange={(e) =>
                          setSlidesChoice(
                            Math.min(SLIDES_MAX, Math.max(SLIDES_MIN, Number(e.target.value) || SLIDES_MIN)),
                          )
                        }
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="compose-photo-source">{td('photoSource.label')}</Label>
                    <select
                      id="compose-photo-source"
                      value={photoSource}
                      onChange={(e) => setPhotoChoice(e.target.value as PhotoSource)}
                      className={selectClass}
                    >
                      {PHOTO_SOURCES.map((p) => (
                        <option key={p} value={p}>
                          {td(`photoSource.${p}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t('compose.slidesHint')}</p>
              </>
            ) : null}
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {chosen === 'auto' && designed
            ? t('compose.autoDesigned')
            : chosen === 'auto'
              ? allowed.length
                ? t('compose.autoAmong', { list: allowed.map((f) => t(`formats.${f}.label`)).join(', ') })
                : t('compose.noCommon')
              : t(`formats.${chosen}.hint`)}
          {wantsVideo && !sources.pexels && source !== 'template' && source !== 'unsplash'
            ? ` ${t('compose.noPexels')}`
            : ''}
          {needsVisual && source === 'unsplash' && !sources.unsplash ? ` ${t('compose.noUnsplash')}` : ''}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="compose-topic">{t('topic')}</Label>
          <Textarea
            id="compose-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t('compose.topicPlaceholder')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compose-cta">{t('cta')}</Label>
            <Input
              id="compose-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              maxLength={200}
              placeholder={t('compose.ctaPlaceholder')}
            />
          </div>
          {chosen === 'link' ? (
            <div className="space-y-1.5">
              <Label htmlFor="compose-link">{t('compose.link')}</Label>
              <Input
                id="compose-link"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={hashtags}
            onChange={(e) => setHashtags(e.target.checked)}
          />
          {t('compose.hashtags')}
        </label>

        <Button
          disabled={run.isPending || topic.trim().length < 3 || !platforms.length || !allowed.length}
          onClick={() => run.mutate()}
        >
          {run.isPending ? t('compose.creating') : t('compose.submit', { count: cost })}
        </Button>
        <ErrorBox error={run.error} />

        {run.data ? (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {t.rich('compose.created', {
                  format: t(`formats.${run.data.format}.label`),
                  b: (chunks) => <strong>{chunks}</strong>,
                })}{' '}
                · {t('charged', { count: run.data.tokensCharged })}
                {run.data.targets ? ` · ${t('compose.accounts', { count: run.data.targets })}` : ''}
              </p>
              <Button nativeButton={false} render={<a href={`/app/posts/${run.data.postId}`} />}>
                {t('compose.open')}
              </Button>
            </div>
            {run.data.media.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {run.data.media.map((m) => (
                  <figure key={m.id} className="space-y-1">
                    {m.kind === 'video' ? (
                      <video
                        src={m.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full rounded-md border bg-black"
                        aria-label={t('compose.videoLabel')}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.url}
                        alt={t('compose.visualAlt')}
                        className="w-full rounded-md border object-cover"
                      />
                    )}
                    {m.attribution ? (
                      <figcaption className="text-[11px] text-muted-foreground">{m.attribution}</figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
            {run.data.variants.map((v) => (
              <div key={v.platform} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {PLATFORMS[v.platform as SocialPlatform]?.label ?? v.platform}
                </p>
                <p className="text-sm whitespace-pre-wrap">{v.text}</p>
              </div>
            ))}
            {run.data.notes.length ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {run.data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
