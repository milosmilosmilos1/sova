'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORM_KEYS, PLATFORMS } from '@/config/platforms'
import type { ApiResponse } from '@/lib/api/response'
import { uploadMediaFile } from '@/lib/media/client-upload'

/**
 * Najprostija stranica za testiranje tri funkcije iz prve verzije (brif, faza 5).
 * Dizajn dolazi u fazi 14; ovde su funkcionalnost i 4 stanja.
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
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : 'Greška.'}
    </div>
  )
}

const ASPECTS = ['1:1', '4:5', '9:16', '16:9', '3:4', '4:3'] as const

export function StudioClient({
  workspaceId,
  brandId,
  brandName,
}: {
  workspaceId: string
  brandId: string
  brandName: string
}) {
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
          <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
          <p className="text-sm text-muted-foreground">Brend: {brandName}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-sm">
          {balance.isPending ? 'Učitavam stanje…' : null}
          {balance.isError ? <span className="text-destructive">Stanje tokena nije učitano.</span> : null}
          {balance.data ? (
            <>
              <strong>{balance.data.balance.available}</strong> tokena dostupno
              {balance.data.balance.reserved ? ` (${balance.data.balance.reserved} rezervisano)` : ''}
            </>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="text">
        <TabsList>
          <TabsTrigger value="text">Tekst za objavu ({balance.data?.prices.text ?? 2})</TabsTrigger>
          <TabsTrigger value="photo">
            Slika iz fotografije ({balance.data?.prices.image_standard ?? 8})
          </TabsTrigger>
          <TabsTrigger value="prompt">
            Slika iz prompta ({balance.data?.prices.image_standard ?? 8})
          </TabsTrigger>
          <TabsTrigger value="template">
            Vizual iz šablona ({balance.data?.prices.visual_template ?? 2})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="template">
          <VisualPanel workspaceId={workspaceId} brandId={brandId} onDone={refreshBalance} />
        </TabsContent>
        <TabsContent value="text">
          <TextPanel brandId={brandId} onDone={refreshBalance} />
        </TabsContent>
        <TabsContent value="photo">
          <ImagePanel workspaceId={workspaceId} brandId={brandId} mode="photo" onDone={refreshBalance} />
        </TabsContent>
        <TabsContent value="prompt">
          <ImagePanel workspaceId={workspaceId} brandId={brandId} mode="prompt" onDone={refreshBalance} />
        </TabsContent>
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
  const upload = useMutation({
    // pravo u skladište (D-082); Vercel funkcija ne prima telo veće od 4,5 MB
    mutationFn: (file: File): Promise<UploadResult> => uploadMediaFile(file, { brandId }),
    onSuccess: (asset) => onChange(asset),
  })
  return (
    <div className="space-y-2">
      <Label htmlFor={`photo-${brandId}`}>Fotografija (JPG, PNG, WebP, do 20 MB)</Label>
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
      {upload.isPending ? <p className="text-sm text-muted-foreground">Otpremam…</p> : null}
      <ErrorBox error={upload.error} />
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt="Otpremljena fotografija"
            className="h-24 rounded-md border object-cover"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Ukloni
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TextPanel({ brandId, onDone }: { brandId: string; onDone: () => void }) {
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
        <CardTitle>Tekst za objavu</CardTitle>
        <CardDescription>
          Sa fotografijom ili bez nje. Jedan zahtev daje verziju za svaku izabranu mrežu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-sm font-medium">Mreže</legend>
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
              {PLATFORMS[p].label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="topic">O čemu je objava?</Label>
          <Textarea
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Npr. nova usluga čišćenja klima uređaja, popust 20 % do kraja meseca za stare klijente"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="goal">Cilj</Label>
            <select
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="engagement">Angažovanje</option>
              <option value="awareness">Svest o brendu</option>
              <option value="sales">Prodaja ili upit</option>
              <option value="education">Edukacija</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variants">Varijanti po mreži</Label>
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
          {generate.isPending ? 'Generišem…' : 'GENERIŠI'}
        </Button>
        <ErrorBox error={generate.error} />
        {generate.data ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Model {generate.data.model}
              {generate.data.fallbackUsed ? ' (fallback)' : ''} · naplaćeno {generate.data.tokensCharged}{' '}
              tokena
            </p>
            {generate.data.output.image_description ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Fotografija: {generate.data.output.image_description}
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
                      <p className="text-xs text-muted-foreground">Prvi komentar: {v.first_comment}</p>
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
        <CardTitle>{mode === 'photo' ? 'Slika iz fotografije' : 'Slika iz prompta'}</CardTitle>
        <CardDescription>
          {mode === 'photo'
            ? 'Otpremite svoju fotografiju i u jedno polje opišite kakvu objavu želite.'
            : 'Opišite vizual; stil i boje brenda se dodaju automatski kad Brand Brain bude popunjen.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'photo' ? <PhotoUpload brandId={brandId} value={photo} onChange={setPhoto} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor={`prompt-${mode}`}>{mode === 'photo' ? 'Kakvu objavu želite?' : 'Opis slike'}</Label>
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
            <Label htmlFor={`aspect-${mode}`}>Format</Label>
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
            <Label htmlFor={`quality-${mode}`}>Kvalitet</Label>
            <select
              id={`quality-${mode}`}
              value={quality}
              onChange={(e) => setQuality(e.target.value as 'standard' | 'premium')}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="standard">Standard (8 tokena)</option>
              <option value="premium">Premium, tekst na slici (15 tokena)</option>
            </select>
          </div>
        </div>
        <Button disabled={!canStart} onClick={() => start.mutate()}>
          {start.isPending ? 'Šaljem…' : 'GENERIŠI'}
        </Button>
        <ErrorBox error={start.error} />
        {jobId ? (
          <div className="space-y-2">
            {job.isPending ? <p className="text-sm text-muted-foreground">Čekam posao…</p> : null}
            <ErrorBox error={job.error} />
            {job.data && (job.data.status === 'queued' || job.data.status === 'running') ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {job.data.progress?.message ?? 'U redu za obradu…'} (osvežava se svake 2 s)
              </p>
            ) : null}
            {job.data?.status === 'failed' ? (
              <ErrorBox error={new Error(job.data.errorMessage ?? 'Generisanje nije uspelo.')} />
            ) : null}
            {job.data?.status === 'succeeded' && job.data.assetUrl ? (
              <figure className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.data.assetUrl}
                  alt="AI generisana slika"
                  className="max-h-[480px] rounded-lg border"
                />
                <figcaption className="text-xs text-muted-foreground">
                  AI generisano · model {job.data.model} · naplaćeno {job.data.tokensCharged} tokena
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

const TEMPLATES = [
  ['auto', 'Automatski'],
  ['photo-overlay', 'Fotografija sa naslovom'],
  ['solid', 'Boja brenda i poruka'],
  ['split', 'Fotografija pored teksta'],
  ['announcement', 'Najava sa okvirom'],
] as const
const TEMPLATE_ASPECTS = ['1:1', '4:5', '9:16', '16:9', '3:4'] as const

function UnsplashPicker({
  value,
  onChange,
}: {
  value: { id: string; attribution: string } | null
  onChange: (v: { id: string; attribution: string } | null) => void
}) {
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
          placeholder="Npr. klima uređaj, kancelarija, kafa"
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(query.trim())}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setSubmitted(query.trim())}
          disabled={query.trim().length < 2}
        >
          Traži
        </Button>
      </div>
      {search.isPending && submitted ? (
        <p className="text-sm text-muted-foreground">Tražim na Unsplash-u…</p>
      ) : null}
      <ErrorBox error={search.error} />
      {search.data && !search.data.configured ? (
        <p className="text-sm text-muted-foreground">
          Unsplash nije podešen; otpremite svoju fotografiju ili napravite vizual bez slike.
        </p>
      ) : null}
      {search.data?.configured && search.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema rezultata za „{submitted}”.</p>
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
                  alt={p.alt ?? 'Unsplash fotografija'}
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
          Izabrano: {value.attribution}{' '}
          <button type="button" className="underline" onClick={() => onChange(null)}>
            ukloni
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
  const [headline, setHeadline] = useState('')
  const [subtext, setSubtext] = useState('')
  const [cta, setCta] = useState('')
  const [aspect, setAspect] = useState<(typeof TEMPLATE_ASPECTS)[number]>('1:1')
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number][0]>('auto')
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
        <CardTitle>Vizual iz šablona</CardTitle>
        <CardDescription>
          Boje, fontovi i logo dolaze iz Brand Brain profila. Fotografija sa Unsplash-a (AI bira najbolju),
          vaša fotografija ili bez slike. 2 tokena.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vt-headline">Naslov na slici</Label>
          <Input
            id="vt-headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            placeholder="Npr. Servis klime od 2.990 din."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vt-subtext">Podnaslov (opciono)</Label>
            <Input
              id="vt-subtext"
              value={subtext}
              onChange={(e) => setSubtext(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-cta">Poziv na akciju (opciono)</Label>
            <Input
              id="vt-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              maxLength={40}
              placeholder="Zakažite termin"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-aspect">Format</Label>
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
            <Label htmlFor="vt-template">Šablon</Label>
            <select
              id="vt-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value as (typeof TEMPLATES)[number][0])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {TEMPLATES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Slika</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ['unsplash', 'Unsplash fotografija'],
                ['asset', 'Moja fotografija'],
                ['none', 'Bez slike'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="vt-source"
                  value={v}
                  checked={source === v}
                  onChange={() => setSource(v)}
                />
                {label}
              </label>
            ))}
          </div>
          {source === 'unsplash' ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Izaberite fotografiju ili ostavite prazno: Sova pretražuje po naslovu i AI bira najbolju.
              </p>
              <UnsplashPicker value={picked} onChange={setPicked} />
              {!picked ? (
                <Input
                  value={unsplashQuery}
                  onChange={(e) => setUnsplashQuery(e.target.value)}
                  placeholder="Pojam za automatsku pretragu (opciono)"
                />
              ) : null}
            </div>
          ) : null}
          {source === 'asset' ? <PhotoUpload brandId={brandId} value={photo} onChange={setPhoto} /> : null}
        </fieldset>
        <Button disabled={!canStart} onClick={() => start.mutate()}>
          {start.isPending ? 'Šaljem…' : 'NAPRAVI VIZUAL'}
        </Button>
        <ErrorBox error={start.error} />
        {jobId ? (
          <div className="space-y-2">
            {job.data && (job.data.status === 'queued' || job.data.status === 'running') ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {job.data.progress?.message ?? 'U redu za obradu…'}
              </p>
            ) : null}
            {job.data?.status === 'failed' ? (
              <ErrorBox error={new Error(job.data.errorMessage ?? 'Vizual nije napravljen.')} />
            ) : null}
            {job.data?.status === 'succeeded' && job.data.assetUrl ? (
              <figure className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={job.data.assetUrl} alt={headline} className="max-h-[560px] rounded-lg border" />
                <figcaption className="text-xs text-muted-foreground">
                  Šablon {job.data.output?.template} · naplaćeno {job.data.tokensCharged} tokena
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
        Želite da doradite u Canvi?{' '}
        <a
          className="underline"
          href={`/api/integrations/canva/connect?workspaceId=${workspaceId}&redirectTo=/app/studio`}
        >
          Povežite Canvu
        </a>
        .
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
        {design.isPending ? 'Otvaram Canvu…' : 'Doradi u Canvi (2)'}
      </Button>
      {designId ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exp.mutate()}
          disabled={exp.isPending}
        >
          {exp.isPending ? 'Uvozim…' : 'Uvezi gotov dizajn iz Canve (2)'}
        </Button>
      ) : null}
      <ErrorBox error={design.error ?? exp.error} />
      {exp.data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={exp.data.asset.url} alt="Dizajn iz Canve" className="max-h-64 rounded-md border" />
      ) : null}
    </div>
  )
}
