'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GoogleBusinessPanel } from '@/components/posts/google-business-panel'
import { PinterestPanel } from '@/components/posts/pinterest-panel'
import { TikTokPanel } from '@/components/posts/tiktok-panel'
import { YouTubePanel } from '@/components/posts/youtube-panel'
import { readGbpOptions } from '@/config/google-business'
import { readPinterestOptions } from '@/config/pinterest'
import { readYouTubeOptions } from '@/config/youtube'
import { PLATFORMS } from '@/config/platforms'
import { readTikTokOptions } from '@/config/tiktok'
import { targetStatusLabel } from '@/config/post-labels'
import type { ApiResponse } from '@/lib/api/response'
import type { WorkspaceRole } from '@/lib/auth/workspace'
import { formatDuration, uploadMediaFile } from '@/lib/media/client-upload'
import {
  aspectFits,
  aspectLabel,
  commonAspectRange,
  cropRect,
  cropTarget,
  type AspectRange,
} from '@/lib/media/crop'
import { pluralSr } from '@/lib/plural'
import { containsUrl } from '@/lib/x-text'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'

/**
 * Composer (faza 9a): master tekst + tekst po mreži, nalozi, mediji iz biblioteke ili upload,
 * prvi komentar, link, termin; radnje state machine-a po ulozi; komentari, verzije, javni link.
 * Forma se remontira po verziji objave (`key`), pa nema sinhronizacije stanja kroz efekte.
 */
interface Account {
  id: string
  platform: keyof typeof PLATFORMS
  name: string
  status: string
  assistedOnly: boolean
}
interface MediaItem {
  id: string
  url: string
  kind?: 'image' | 'video'
  mimeType?: string
  width: number | null
  height: number | null
  durationMs?: number | null
  altText: string | null
}
interface Target {
  id: string
  socialAccountId: string
  platform: keyof typeof PLATFORMS
  accountName: string | null
  text: string
  usesMaster: boolean
  options?: Record<string, unknown>
  status: string
  scheduledAt: string | null
  permalink: string | null
  lastErrorMessage: string | null
  externalPostId: string | null
}
interface PostView {
  id: string
  status: string
  statusLabel: string
  version: number
  title: string | null
  masterText: string
  firstComment: string | null
  linkUrl: string | null
  pillarId: string | null
  campaignId: string | null
  scheduledFor: string | null
  lockedAt: string | null
  source?: string
  qaReport?: { passed: boolean; checks: Array<{ name: string; ok: boolean; message: string }> } | null
  targets: Target[]
  media: Array<{
    mediaAssetId: string
    url: string | null
    width: number | null
    height: number | null
    mimeType: string | null
    altText: string | null
    socialAccountId: string | null
  }>
  actions: string[]
}
interface Comment {
  id: string
  authorName: string
  body: string
  viaLink: boolean
  createdAt: string
}
interface Version {
  version: number
  change_summary: string | null
  created_at: string
}
interface Problem {
  platform: string
  problems: string[]
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) {
    const details = (data.error as { details?: { problems?: Problem[] } }).details
    const extra = details?.problems?.length
      ? ` ${details.problems.map((p) => `${PLATFORMS[p.platform as keyof typeof PLATFORMS]?.label ?? p.platform}: ${p.problems.join(' ')}`).join(' | ')}`
      : ''
    throw new Error(`${data.error.message}${extra}`)
  }
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

function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const w = wallClock(iso, timeZone)
  return `${w.date}T${w.time}`
}

/** Vreme iz polja u zoni brenda → UTC; nepostojeći sat (prelaz na letnje vreme) ide unapred (K2). */
function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null
  const [date, time] = value.split('T')
  return zonedToUtc(date!, time!.slice(0, 5), timeZone)
}

/** X je pay-per-use: objava sa linkom (i domenom bez https://) košta više (D-013, D-083). */
function XCostNote({ withLink }: { withLink: boolean }) {
  const cost = withLink ? 6 : 1
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Objava na X troši {cost} {pluralSr(cost, 'token', 'tokena', 'tokena')}
      {withLink ? ' jer ima link' : ''} (bez linka 1, sa linkom 6); naplaćuje se tek kad objava prođe.
    </p>
  )
}

const ACTION_LABEL: Record<string, string> = {
  submit: 'Pošalji na odobrenje',
  withdraw: 'Povuci sa odobravanja',
  schedule: 'Zakaži',
  unschedule: 'Otkaži zakazivanje',
  pause: 'Pauziraj',
  resume: 'Nastavi',
  cancel: 'Otkaži objavu',
  restore: 'Vrati u nacrt',
  delete: 'Obriši',
}

interface FormState {
  title: string
  masterText: string
  firstComment: string
  linkUrl: string
  /** '' = bez stuba ili kampanje */
  pillarId: string
  campaignId: string
  selected: Record<string, SelectedTarget>
  mediaIds: string[]
  when: string
}

/** Izbor naloga u formi; `options` čuva podešavanja po mreži (npr. `tiktok`) i šalje se uz target. */
interface SelectedTarget {
  on: boolean
  text: string
  options: Record<string, unknown>
}

/** Lokalni nacrt (EDGE_CASES A4): čuva se dok korisnik kuca, briše posle uspešnog čuvanja. */
interface StoredDraft {
  savedAt: number
  version: number
  form: FormState
}

function draftKeyFor(brandId: string, postId: string | null): string {
  return `sova:nacrt:${brandId}:${postId ?? 'nova'}`
}

function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as StoredDraft
    const f = d?.form
    if (
      !f ||
      typeof f.masterText !== 'string' ||
      typeof f.selected !== 'object' ||
      !Array.isArray(f.mediaIds)
    )
      return null
    return d
  } catch {
    return null
  }
}

/**
 * Nacrt kakav je bio kad se editor otvorio: čita se jednom po otvaranju, pa čuvanje iz iste sesije ne
 * izaziva ponudu „Vrati nacrt” dok korisnik kuca. Unos se briše pri zatvaranju editora, da sledeće
 * otvaranje (i bez osvežavanja strane) pročita sveže stanje.
 */
const draftsAtOpen = new Map<string, string | null>()

function draftAtOpen(key: string): string | null {
  if (!draftsAtOpen.has(key)) {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      // skladište nedostupno: nema ponude
    }
    draftsAtOpen.set(key, raw)
  }
  return draftsAtOpen.get(key) ?? null
}

const noSubscription = () => () => {}

function removeDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // privatni režim ili blokirano skladište: nacrt se samo ne čuva
  }
}

function initialForm(p: PostView | null, timezone: string): FormState {
  const selected: Record<string, SelectedTarget> = {}
  for (const t of p?.targets ?? [])
    selected[t.socialAccountId] = { on: true, text: t.usesMaster ? '' : t.text, options: t.options ?? {} }
  return {
    title: p?.title ?? '',
    masterText: p?.masterText ?? '',
    firstComment: p?.firstComment ?? '',
    linkUrl: p?.linkUrl ?? '',
    pillarId: p?.pillarId ?? '',
    campaignId: p?.campaignId ?? '',
    selected,
    mediaIds: p?.media.map((m) => m.mediaAssetId) ?? [],
    when: toLocalInput(p?.scheduledFor ?? null, timezone),
  }
}

export function PostEditor({
  brandId,
  brandName,
  timezone,
  postId,
  role,
}: {
  brandId: string
  brandName: string
  timezone: string
  postId: string | null
  role: WorkspaceRole
}) {
  const post = useQuery({
    queryKey: ['post', postId],
    queryFn: () => api<PostView>(`/api/posts/${postId}`),
    enabled: Boolean(postId),
    // dok se objavljuje (ili čeka termin) osvežavaj da korisnik vidi kad objava ode
    refetchInterval: (q) =>
      q.state.data?.status === 'publishing' || q.state.data?.status === 'scheduled' ? 15_000 : false,
  })
  if (postId && post.isPending) return <p className="text-sm text-muted-foreground">Učitavam objavu…</p>
  if (postId && post.isError) return <ErrorBox error={post.error} />
  const p = post.data ?? null
  return (
    <EditorForm
      key={p ? `${p.id}:${p.version}` : 'new'}
      brandId={brandId}
      brandName={brandName}
      timezone={timezone}
      postId={postId}
      role={role}
      post={p}
    />
  )
}

function EditorForm({
  brandId,
  brandName,
  timezone,
  postId,
  role,
  post: p,
}: {
  brandId: string
  brandName: string
  timezone: string
  postId: string | null
  role: WorkspaceRole
  post: PostView | null
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const canEdit = ['owner', 'admin', 'editor'].includes(role)
  const accounts = useQuery({
    queryKey: ['social-accounts', brandId, null],
    queryFn: () => api<{ accounts: Account[] }>(`/api/social-accounts?brandId=${brandId}`),
  })
  const pillars = useQuery({
    queryKey: ['pillars', brandId],
    queryFn: () =>
      api<{ pillars: Array<{ id: string; name: string; isActive: boolean }> }>(
        `/api/pillars?brandId=${brandId}`,
      ),
  })
  const campaigns = useQuery({
    queryKey: ['campaigns', brandId],
    queryFn: () =>
      api<{ campaigns: Array<{ id: string; name: string; endsOn: string | null }> }>(
        `/api/campaigns?brandId=${brandId}`,
      ),
  })
  const library = useQuery({
    queryKey: ['media', brandId],
    queryFn: () => api<MediaItem[]>(`/api/media?brandId=${brandId}&limit=40`),
  })
  const comments = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => api<Comment[]>(`/api/posts/${postId}/comments`),
    enabled: Boolean(postId),
  })
  const versions = useQuery({
    queryKey: ['versions', postId],
    queryFn: () => api<Version[]>(`/api/posts/${postId}/versions`),
    enabled: Boolean(postId),
  })

  const [form, setForm] = useState<FormState>(() => initialForm(p, timezone))
  const draftKey = draftKeyFor(brandId, postId)
  const [baseline] = useState(() => JSON.stringify(initialForm(p, timezone)))
  const formJson = JSON.stringify(form)
  // nacrt iz prethodnog otvaranja; server nema localStorage (null), klijent čita posle hidracije
  const storedRaw = useSyncExternalStore(
    noSubscription,
    () => draftAtOpen(draftKey),
    () => null,
  )
  useEffect(
    () => () => {
      draftsAtOpen.delete(draftKey)
    },
    [draftKey],
  )
  const stored = useMemo(() => parseDraft(storedRaw), [storedRaw])
  const [draftDismissed, setDraftDismissed] = useState(false)
  const storedJson = stored ? JSON.stringify(stored.form) : null
  const offerDraft = Boolean(stored && !draftDismissed && storedJson !== formJson && storedJson !== baseline)
  // posle uspešnog čuvanja tajmer koji još čeka ne sme da vrati obrisan nacrt (forma se zatim remontira)
  const savedRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => {
      if (savedRef.current) return
      try {
        if (formJson === baseline) window.localStorage.removeItem(draftKey)
        else
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({
              savedAt: Date.now(),
              version: p?.version ?? 0,
              form: JSON.parse(formJson) as FormState,
            }),
          )
      } catch {
        // skladište nedostupno: bez lokalnog nacrta
      }
    }, 600)
    return () => clearTimeout(t)
  }, [formJson, baseline, draftKey, p?.version])
  const [comment, setComment] = useState('')
  const [linkUrlCreated, setLinkUrlCreated] = useState<string | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const today = new Date().toISOString().slice(0, 10)

  const body = () => ({
    title: form.title || null,
    masterText: form.masterText,
    firstComment: form.firstComment || null,
    linkUrl: form.linkUrl || null,
    pillarId: form.pillarId || null,
    campaignId: form.campaignId || null,
    targets: Object.entries(form.selected)
      .filter(([, v]) => v.on)
      .map(([socialAccountId, v]) => ({
        socialAccountId,
        text: v.text || undefined,
        ...(Object.keys(v.options).length ? { options: v.options } : {}),
      })),
    media: form.mediaIds.map((mediaAssetId, i) => ({ mediaAssetId, sortOrder: i })),
    scheduledFor: fromLocalInput(form.when, timezone),
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['post', postId] })
    void qc.invalidateQueries({ queryKey: ['comments', postId] })
    void qc.invalidateQueries({ queryKey: ['versions', postId] })
    void qc.invalidateQueries({ queryKey: ['posts', brandId] })
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!postId) {
        const b = body()
        return api<PostView>('/api/posts', {
          method: 'POST',
          json: {
            brandId,
            ...b,
            title: b.title ?? undefined,
            firstComment: b.firstComment ?? undefined,
            linkUrl: b.linkUrl ?? undefined,
            pillarId: b.pillarId ?? undefined,
            campaignId: b.campaignId ?? undefined,
            scheduledFor: b.scheduledFor ?? undefined,
          },
        })
      }
      return api<PostView>(`/api/posts/${postId}`, {
        method: 'PATCH',
        json: { version: p!.version, ...body() },
      })
    },
    onSuccess: (saved) => {
      savedRef.current = true
      removeDraft(draftKey)
      if (!postId) router.push(`/app/posts/${saved.id}`)
      else refresh()
    },
  })
  const action = useMutation({
    mutationFn: ({ name, extra }: { name: string; extra?: Record<string, unknown> }) =>
      api<PostView>(`/api/posts/${postId}/${name}`, {
        method: 'POST',
        json: { version: p!.version, ...(extra ?? {}) },
      }),
    onSuccess: (result, vars) => {
      setComment('')
      if (vars.name === 'duplicate') router.push(`/app/posts/${result.id}`)
      else refresh()
    },
  })
  const targetAction = useMutation({
    mutationFn: ({
      targetId,
      name,
      extra,
    }: {
      targetId: string
      name: string
      extra?: Record<string, unknown>
    }) =>
      api<PostView>(`/api/posts/${postId}/targets/${targetId}/${name}`, {
        method: 'POST',
        json: extra ?? {},
      }),
    onSuccess: () => refresh(),
  })
  const del = useMutation({
    mutationFn: () => api(`/api/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: () => router.push('/app/posts'),
  })
  const addComment = useMutation({
    mutationFn: () => api(`/api/posts/${postId}/comments`, { method: 'POST', json: { body: comment } }),
    onSuccess: () => {
      setComment('')
      void qc.invalidateQueries({ queryKey: ['comments', postId] })
    },
  })
  const makeLink = useMutation({
    mutationFn: () =>
      api<{ url: string }>('/api/approval-links', {
        method: 'POST',
        json: { brandId, postIds: [postId], expiresInDays: 7 },
      }),
    onSuccess: (r) => setLinkUrlCreated(r.url),
  })
  const [cropping, setCropping] = useState<{ id: string; position: number } | null>(null)
  const [replacing, setReplacing] = useState<string | null>(null)
  const crop = useMutation({
    mutationFn: (c: { id: string; aspect: number; position: number }) =>
      api<MediaItem>(`/api/media/${c.id}/crop`, {
        method: 'POST',
        json: { aspect: c.aspect, position: c.position },
      }),
    onSuccess: (m, c) => {
      // isečak zauzima mesto originala; ako je isti isečak već izabran, original samo otpada
      setForm((f) => ({
        ...f,
        mediaIds: f.mediaIds.includes(m.id)
          ? f.mediaIds.filter((x) => x !== c.id)
          : f.mediaIds.map((x) => (x === c.id ? m.id : x)),
      }))
      setCropping(null)
      void qc.invalidateQueries({ queryKey: ['media', brandId] })
    },
  })
  const replaceMedia = useMutation({
    mutationFn: (toMediaId: string) =>
      api<PostView>(`/api/posts/${postId}/media/replace`, {
        method: 'POST',
        json: { version: p!.version, fromMediaId: replacing, toMediaId },
      }),
    onSuccess: () => {
      setReplacing(null)
      refresh()
      void qc.invalidateQueries({ queryKey: ['media', brandId] })
    },
  })
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const upload = useMutation({
    // pravo u skladište (D-082): Vercel funkcija ne prima telo veće od 4,5 MB
    mutationFn: (file: File) => uploadMediaFile(file, { brandId, onProgress: setUploadProgress }),
    onSettled: () => setUploadProgress(null),
    onSuccess: (m) => {
      if (replacing) replaceMedia.mutate(m.id)
      else set('mediaIds', [...form.mediaIds, m.id])
      void qc.invalidateQueries({ queryKey: ['media', brandId] })
    },
  })

  const actions = p?.actions ?? []
  const editable = canEdit && (!p || actions.includes('edit'))
  // zakazanu objavu editor ne menja, ali vlasnik ili administrator menja medij bez otkazivanja (U9)
  const canReplace = Boolean(
    p && !p.lockedAt && ['scheduled', 'paused'].includes(p.status) && ['owner', 'admin'].includes(role),
  )

  // odnos stranica izabranih slika prema izabranim mrežama (N9); YouTube prima samo video
  const imageRanges = Object.entries(form.selected)
    .filter(([, v]) => v.on)
    .map(([id]) => accounts.data?.accounts.find((a) => a.id === id)?.platform)
    .filter((pl): pl is keyof typeof PLATFORMS => Boolean(pl) && pl !== 'youtube')
    .filter((pl, i, all) => all.indexOf(pl) === i)
  const common = commonAspectRange(imageRanges.map((pl) => PLATFORMS[pl].imageAspect))
  const mediaInfo = new Map<
    string,
    { url: string | null; width: number | null; height: number | null; mimeType?: string | null }
  >([
    ...(p?.media.map((m) => [m.mediaAssetId, m] as const) ?? []),
    ...(library.data?.map((m) => [m.id, m] as const) ?? []),
  ])
  const aspectIssues = form.mediaIds.flatMap((id, index) => {
    const m = mediaInfo.get(id)
    if (!m?.url || !m.width || !m.height || m.mimeType?.startsWith('video/')) return []
    const ratio = m.width / m.height
    const bad = imageRanges.filter((pl) => !aspectFits(ratio, PLATFORMS[pl].imageAspect))
    if (!bad.length) return []
    const target = common ? cropTarget(ratio, common) : null
    return [{ id, index, ratio, bad, target, url: m.url, width: m.width, height: m.height }]
  })
  const hasContent = form.masterText.trim().length > 0 || form.mediaIds.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* min-w-0: dugačak sadržaj ne širi kolonu preko ekrana telefona */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{postId ? 'Objava' : 'Nova objava'}</h1>
          {p ? <Badge>{p.statusLabel}</Badge> : <Badge variant="secondary">nacrt</Badge>}
          {p ? <span className="text-xs text-muted-foreground">verzija {p.version}</span> : null}
          <span className="text-xs text-muted-foreground">
            · {brandName} · zona {timezone}
          </span>
        </div>
        {p?.lockedAt ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Objava se upravo objavljuje i ne može da se menja.
          </p>
        ) : null}
        {offerDraft && stored ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          >
            <span>
              Imate nesačuvan nacrt od {new Date(stored.savedAt).toLocaleString('sr-Latn-RS')}
              {p && stored.version !== p.version ? ' (napravljen na starijoj verziji objave)' : ''}.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({ ...initialForm(p, timezone), ...stored.form })
                setDraftDismissed(true)
              }}
            >
              Vrati nacrt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                removeDraft(draftKey)
                setDraftDismissed(true)
              }}
            >
              Odbaci
            </Button>
          </div>
        ) : null}
        {p?.qaReport?.checks?.length ? <QaReportBox report={p.qaReport} /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sadržaj</CardTitle>
            <CardDescription>
              Master tekst važi za sve mreže; po mreži možete upisati drugačiji tekst.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="p-title">Interni naslov (opciono)</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={200}
                disabled={!editable}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-text">Tekst objave</Label>
              <Textarea
                id="p-text"
                value={form.masterText}
                onChange={(e) => set('masterText', e.target.value)}
                rows={6}
                maxLength={20000}
                disabled={!editable}
              />
              <p className="text-xs text-muted-foreground">{form.masterText.length} karaktera</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="p-link">Link (opciono)</Label>
                <Input
                  id="p-link"
                  value={form.linkUrl}
                  onChange={(e) => set('linkUrl', e.target.value)}
                  placeholder="https://"
                  disabled={!editable}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-first">Prvi komentar (Instagram, Facebook i LinkedIn, opciono)</Label>
                <Input
                  id="p-first"
                  value={form.firstComment}
                  onChange={(e) => set('firstComment', e.target.value)}
                  maxLength={2200}
                  disabled={!editable}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-pillar">Stub sadržaja (opciono)</Label>
                <select
                  id="p-pillar"
                  value={form.pillarId}
                  onChange={(e) => set('pillarId', e.target.value)}
                  disabled={!editable}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
                >
                  <option value="">Bez stuba</option>
                  {(pillars.data?.pillars ?? [])
                    .filter((x) => x.isActive || x.id === form.pillarId)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-campaign">Kampanja (opciono)</Label>
                <select
                  id="p-campaign"
                  value={form.campaignId}
                  onChange={(e) => set('campaignId', e.target.value)}
                  disabled={!editable}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
                >
                  <option value="">Bez kampanje</option>
                  {(campaigns.data?.campaigns ?? [])
                    .filter((x) => !x.endsOn || x.endsOn >= today || x.id === form.campaignId)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mreže</CardTitle>
            <CardDescription>
              Izaberite naloge; za svaki možete prilagoditi tekst (limit po mreži se proverava pri slanju).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.data && accounts.data.accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nema povezanih mreža. Povežite ih na strani „Mreže”.
              </p>
            ) : null}
            {accounts.data?.accounts.map((a) => {
              const sel = form.selected[a.id] ?? { on: false, text: '', options: {} }
              return (
                <div key={a.id} className="rounded-md border p-3">
                  <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <input
                      type="checkbox"
                      checked={sel.on}
                      disabled={!editable || a.status !== 'active'}
                      onChange={(e) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, on: e.target.checked },
                        })
                      }
                    />
                    <span className="font-medium">{a.name}</span>
                    <Badge variant="outline">{PLATFORMS[a.platform]?.label ?? a.platform}</Badge>
                    {a.status !== 'active' ? <Badge variant="secondary">{a.status}</Badge> : null}
                    {a.assistedOnly ? <Badge variant="secondary">asistirano</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      limit {PLATFORMS[a.platform]?.textMax} karaktera
                    </span>
                  </label>
                  {sel.on ? (
                    <Textarea
                      className="mt-2"
                      rows={3}
                      placeholder="Prazno = master tekst"
                      value={sel.text}
                      disabled={!editable}
                      onChange={(e) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, on: true, text: e.target.value },
                        })
                      }
                    />
                  ) : null}
                  {sel.on && a.platform === 'tiktok' ? (
                    <TikTokPanel
                      accountId={a.id}
                      value={readTikTokOptions(sel.options.tiktok)}
                      disabled={!editable}
                      isVideo={form.mediaIds.some((id) =>
                        library.data?.find((m) => m.id === id)?.mimeType?.startsWith('video/'),
                      )}
                      onChange={(tiktok) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, options: { ...sel.options, tiktok } },
                        })
                      }
                    />
                  ) : null}
                  {sel.on && a.platform === 'x' ? (
                    <XCostNote
                      withLink={
                        Boolean(form.linkUrl.trim()) || containsUrl(sel.text.trim() || form.masterText)
                      }
                    />
                  ) : null}
                  {sel.on && a.platform === 'pinterest' ? (
                    <PinterestPanel
                      accountId={a.id}
                      value={readPinterestOptions({ pinterest: sel.options.pinterest })}
                      postTitle={form.title}
                      text={sel.text.trim() || form.masterText}
                      disabled={!editable}
                      onChange={(pinterest) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, options: { ...sel.options, pinterest } },
                        })
                      }
                    />
                  ) : null}
                  {sel.on && a.platform === 'youtube' ? (
                    <YouTubePanel
                      accountId={a.id}
                      value={readYouTubeOptions({ youtube: sel.options.youtube })}
                      postTitle={form.title}
                      text={sel.text.trim() || form.masterText}
                      disabled={!editable}
                      onChange={(youtube) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, options: { ...sel.options, youtube } },
                        })
                      }
                    />
                  ) : null}
                  {sel.on && a.platform === 'google_business' ? (
                    <GoogleBusinessPanel
                      accountId={a.id}
                      value={readGbpOptions({ google_business: sel.options.google_business })}
                      postLink={form.linkUrl.trim() || null}
                      disabled={!editable}
                      onChange={(google_business) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { ...sel, options: { ...sel.options, google_business } },
                        })
                      }
                    />
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mediji</CardTitle>
            <CardDescription>
              Iz biblioteke brenda (upload, Unsplash, šabloni, AI slike) ili otpremite fotografiju ili video
              (MP4, MOV).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canReplace && p ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Zamena medija bez otkazivanja termina</p>
                <p className="text-xs text-muted-foreground">
                  Novi fajl prolazi istu proveru za mreže kao pri zakazivanju, a termin ostaje isti.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {p.media.map((m, i) => {
                    const on = replacing === m.mediaAssetId
                    return (
                      <li
                        key={`${m.mediaAssetId}:${m.socialAccountId ?? ''}`}
                        className="flex items-center gap-2 rounded-md border p-1.5 pr-2"
                      >
                        {m.mimeType?.startsWith('video/') ? (
                          <span className="grid size-10 place-items-center rounded bg-black text-xs text-white">
                            ▶
                          </span>
                        ) : m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={m.altText ?? ''} className="size-10 rounded object-cover" />
                        ) : null}
                        <span className="text-xs text-muted-foreground">{i + 1}.</span>
                        <Button
                          size="sm"
                          variant={on ? 'default' : 'outline'}
                          aria-pressed={on}
                          disabled={replaceMedia.isPending}
                          onClick={() => setReplacing(on ? null : m.mediaAssetId)}
                        >
                          {on ? 'Odustani' : 'Zameni'}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
                {replacing ? (
                  <p role="status" className="text-sm">
                    {replaceMedia.isPending
                      ? 'Menjam medij…'
                      : 'Izaberite novi medij iz biblioteke ispod ili otpremite fajl.'}
                  </p>
                ) : null}
                <ErrorBox error={replaceMedia.error} />
              </div>
            ) : null}
            {editable || replacing ? (
              <Input
                type="file"
                aria-label="Otpremi fotografiju ili video"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                disabled={upload.isPending || replaceMedia.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) upload.mutate(file)
                }}
              />
            ) : null}
            {upload.isPending ? (
              <div className="space-y-1" role="status">
                <p className="text-sm text-muted-foreground">
                  Otpremam…{uploadProgress !== null ? ` ${Math.round(uploadProgress * 100)} %` : ''}
                </p>
                <progress
                  className="h-1.5 w-full"
                  max={1}
                  value={uploadProgress ?? undefined}
                  aria-label="Napredak otpremanja"
                />
              </div>
            ) : null}
            <ErrorBox error={upload.error} />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {library.data?.map((m) => {
                const idx = form.mediaIds.indexOf(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={replacing ? form.mediaIds.includes(m.id) || replaceMedia.isPending : !editable}
                    onClick={() =>
                      replacing
                        ? replaceMedia.mutate(m.id)
                        : set(
                            'mediaIds',
                            form.mediaIds.includes(m.id)
                              ? form.mediaIds.filter((x) => x !== m.id)
                              : [...form.mediaIds, m.id],
                          )
                    }
                    className={`relative overflow-hidden rounded-md border ${idx >= 0 ? 'ring-2 ring-primary' : ''}`}
                    title={m.altText ?? ''}
                  >
                    {m.kind === 'video' || m.mimeType?.startsWith('video/') ? (
                      <>
                        <video
                          src={m.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="aspect-square w-full bg-black object-cover"
                          aria-label={m.altText || 'Video'}
                        />
                        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white">
                          ▶ {formatDuration(m.durationMs)}
                        </span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.url}
                        alt={m.altText ?? ''}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {idx >= 0 ? (
                      <span className="absolute top-1 left-1 rounded bg-primary px-1.5 text-xs text-primary-foreground">
                        {idx + 1}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {library.data && library.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Biblioteka je prazna.</p>
            ) : null}
            {editable
              ? aspectIssues.map((issue) => (
                  <AspectIssueBox
                    key={issue.id}
                    issue={issue}
                    cropping={cropping?.id === issue.id ? cropping.position : null}
                    pending={crop.isPending}
                    error={cropping?.id === issue.id ? crop.error : null}
                    onStart={() => {
                      crop.reset()
                      setCropping({ id: issue.id, position: 0.5 })
                    }}
                    onPosition={(position) => setCropping({ id: issue.id, position })}
                    onCancel={() => setCropping(null)}
                    onCrop={() =>
                      issue.target !== null &&
                      crop.mutate({ id: issue.id, aspect: issue.target, position: cropping?.position ?? 0.5 })
                    }
                  />
                ))
              : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Termin</CardTitle>
            <CardDescription>
              Vreme u zoni brenda ({timezone}). Zakazivanje je posebna radnja ispod.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="datetime-local"
              aria-label="Termin objave"
              value={form.when}
              onChange={(e) => set('when', e.target.value)}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button onClick={() => save.mutate()} disabled={save.isPending || !hasContent}>
              {save.isPending ? 'Čuvam…' : postId ? 'Sačuvaj izmene' : 'Sačuvaj nacrt'}
            </Button>
          ) : null}
          {p && actions.includes('submit') ? (
            <Button
              variant="outline"
              onClick={() => action.mutate({ name: 'submit' })}
              disabled={action.isPending}
            >
              {ACTION_LABEL.submit}
            </Button>
          ) : null}
          {p && actions.includes('schedule') ? (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  action.mutate({
                    name: 'schedule',
                    extra: { scheduledFor: fromLocalInput(form.when, timezone) },
                  })
                }
                disabled={action.isPending || !form.when}
              >
                {ACTION_LABEL.schedule}
              </Button>
              <Button
                variant="outline"
                onClick={() => action.mutate({ name: 'publish-now' })}
                disabled={action.isPending}
              >
                Objavi sada
              </Button>
            </>
          ) : null}
          {p
            ? ['withdraw', 'unschedule', 'pause', 'resume', 'cancel', 'restore']
                .filter((a) => actions.includes(a))
                .map((a) => (
                  <Button
                    key={a}
                    variant="outline"
                    onClick={() => action.mutate({ name: a })}
                    disabled={action.isPending}
                  >
                    {ACTION_LABEL[a]}
                  </Button>
                ))
            : null}
          {p && canEdit ? (
            <Button
              variant="ghost"
              onClick={() => action.mutate({ name: 'duplicate' })}
              disabled={action.isPending}
            >
              Dupliraj
            </Button>
          ) : null}
          {p && actions.includes('delete') ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              {ACTION_LABEL.delete}
            </Button>
          ) : null}
        </div>
        <ErrorBox error={save.error ?? action.error ?? del.error} />

        {p &&
        (actions.includes('approve') || actions.includes('reject') || actions.includes('request_changes')) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Odluka</CardTitle>
              <CardDescription>
                Odobrite, odbijte ili zatražite izmene (komentar je obavezan za odbijanje i izmene).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Komentar za autora"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => action.mutate({ name: 'approve', extra: { comment: comment || undefined } })}
                  disabled={action.isPending}
                >
                  Odobri
                </Button>
                <Button
                  variant="outline"
                  onClick={() => action.mutate({ name: 'request-changes', extra: { comment } })}
                  disabled={action.isPending || !comment.trim()}
                >
                  Traži izmene
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => action.mutate({ name: 'reject', extra: { comment } })}
                  disabled={action.isPending || !comment.trim()}
                >
                  Odbij
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="min-w-0 space-y-4">
        {p ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Targeti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.targets.map((t) => (
                <TargetCard
                  key={t.id}
                  t={t}
                  media={p.media.filter((m) => !m.socialAccountId || m.socialAccountId === t.socialAccountId)}
                  timezone={timezone}
                  canEdit={canEdit}
                  busy={targetAction.isPending}
                  onRetry={() => targetAction.mutate({ targetId: t.id, name: 'retry' })}
                  onAssistedDone={(permalink) =>
                    targetAction.mutate({
                      targetId: t.id,
                      name: 'assisted-done',
                      extra: { permalink: permalink || null },
                    })
                  }
                />
              ))}
              <ErrorBox error={targetAction.error} />
            </CardContent>
          </Card>
        ) : null}
        {p && p.status === 'in_review' && canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Javni link za klijenta</CardTitle>
              <CardDescription>Klijent bez naloga vidi objavu i odlučuje. Link važi 7 dana.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Button
                size="sm"
                variant="outline"
                onClick={() => makeLink.mutate()}
                disabled={makeLink.isPending}
              >
                Napravi link
              </Button>
              {linkUrlCreated ? (
                <Input readOnly value={linkUrlCreated} onFocus={(e) => e.currentTarget.select()} />
              ) : null}
              <ErrorBox error={makeLink.error} />
            </CardContent>
          </Card>
        ) : null}
        {p ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Komentari</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {comments.data?.length ? (
                comments.data.map((c) => (
                  <div key={c.id} className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">
                      {c.authorName}
                      {c.viaLink ? ' (klijent)' : ''} · {new Date(c.createdAt).toLocaleString('sr-Latn-RS')}
                    </p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Još nema komentara.</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Napišite komentar"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addComment.mutate()}
                  disabled={!comment.trim() || addComment.isPending}
                >
                  Pošalji
                </Button>
              </div>
              <ErrorBox error={addComment.error} />
            </CardContent>
          </Card>
        ) : null}
        {p && versions.data?.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verzije</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              {versions.data.slice(0, 12).map((v) => (
                <p key={v.version}>
                  v{v.version} · {v.change_summary ?? ''} ·{' '}
                  {new Date(v.created_at).toLocaleString('sr-Latn-RS')}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  )
}

const rangeLabel = (r: AspectRange) =>
  r.min === r.max ? aspectLabel(r.min) : `${aspectLabel(r.min)} do ${aspectLabel(r.max)}`

interface AspectIssue {
  id: string
  index: number
  ratio: number
  bad: Array<keyof typeof PLATFORMS>
  /** odnos na koji se seče; null kad izabrane mreže nemaju zajednički opseg */
  target: number | null
  url: string
  width: number
  height: number
}

/** Slika van opsega mreže (EDGE_CASES N9): šta ne valja i sečenje uz pregled pre upisa. */
function AspectIssueBox({
  issue,
  cropping,
  pending,
  error,
  onStart,
  onPosition,
  onCancel,
  onCrop,
}: {
  issue: AspectIssue
  /** položaj isečka dok je pregled otvoren, inače null */
  cropping: number | null
  pending: boolean
  error: unknown
  onStart: () => void
  onPosition: (position: number) => void
  onCancel: () => void
  onCrop: () => void
}) {
  return (
    <div
      role="status"
      className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <p>
        Slika {issue.index + 1} ima odnos {aspectLabel(issue.ratio)}, a{' '}
        {issue.bad
          .map((pl) => `${PLATFORMS[pl].label} prima ${rangeLabel(PLATFORMS[pl].imageAspect)}`)
          .join(', ')}
        .
      </p>
      {issue.target === null ? (
        <p>
          Izabrane mreže nemaju zajednički odnos stranica. Napravite posebnu objavu za mrežu koja traži
          drugačiji format.
        </p>
      ) : cropping === null ? (
        <Button size="sm" variant="outline" onClick={onStart}>
          Iseci na {aspectLabel(issue.target)}
        </Button>
      ) : (
        <div className="space-y-3">
          <CropPreview
            url={issue.url}
            width={issue.width}
            height={issue.height}
            target={issue.target}
            position={cropping}
            onPosition={onPosition}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onCrop} disabled={pending}>
              {pending ? 'Sečem…' : `Iseci na ${aspectLabel(issue.target)}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
              Odustani
            </Button>
          </div>
          <p className="text-xs">Isečak postaje nova slika u biblioteci; original ostaje netaknut.</p>
          <ErrorBox error={error} />
        </div>
      )}
    </div>
  )
}

/** Ceo kadar sa zatamnjenim delom koji otpada; klizač pomera isečak po osi koja se seče. */
function CropPreview({
  url,
  width,
  height,
  target,
  position,
  onPosition,
}: {
  url: string
  width: number
  height: number
  target: number
  position: number
  onPosition: (position: number) => void
}) {
  const rect = cropRect(width, height, target, position)
  const acrossWidth = rect.width < width
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto overflow-hidden rounded-md bg-muted"
        style={{
          aspectRatio: `${width} / ${height}`,
          width: `min(100%, ${Math.round((260 * width) / height)}px)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="size-full object-cover" />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm border-2 border-white"
          style={{
            left: pct(rect.left, width),
            top: pct(rect.top, height),
            width: pct(rect.width, width),
            height: pct(rect.height, height),
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)',
          }}
        />
      </div>
      <label className="flex items-center gap-3 text-xs">
        <span className="shrink-0">{acrossWidth ? 'Levo – desno' : 'Gore – dole'}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(position * 100)}
          onChange={(e) => onPosition(Number(e.target.value) / 100)}
          className="w-full accent-primary"
          aria-label="Položaj isečka"
        />
      </label>
    </div>
  )
}

function TargetCard({
  t,
  media,
  timezone,
  canEdit,
  busy,
  onRetry,
  onAssistedDone,
}: {
  t: Target
  media: Array<{ url: string | null; altText: string | null }>
  timezone: string
  canEdit: boolean
  busy: boolean
  onRetry: () => void
  onAssistedDone: (permalink: string) => void
}) {
  const [permalink, setPermalink] = useState('')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  const failed = t.status === 'failed' || t.status === 'needs_reauth'
  const done = t.status === 'published' || t.status === 'assisted_done'
  return (
    <div className="space-y-1 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{t.accountName ?? t.platform}</span>
        <Badge variant={failed ? 'destructive' : done ? 'default' : 'outline'}>
          {targetStatusLabel(t.status)}
        </Badge>
      </div>
      {t.scheduledAt ? (
        <p className="text-xs text-muted-foreground">
          {new Date(t.scheduledAt).toLocaleString('sr-Latn-RS', { timeZone: timezone })}
        </p>
      ) : null}
      {t.permalink ? (
        <a href={t.permalink} target="_blank" rel="noreferrer" className="text-xs underline">
          Otvori objavu
        </a>
      ) : null}
      {t.lastErrorMessage ? <p className="text-xs text-destructive">{t.lastErrorMessage}</p> : null}
      {failed && canEdit ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
            Pokušaj ponovo
          </Button>
          {t.status === 'needs_reauth' ? (
            <Button size="sm" variant="ghost" render={<Link href="/app/accounts" />} nativeButton={false}>
              Mreže
            </Button>
          ) : null}
        </div>
      ) : null}
      {t.status === 'assisted_pending' ? (
        <div className="space-y-2 pt-1 text-xs">
          <p className="text-muted-foreground">
            Ova mreža se objavljuje ručno: kopirajte tekst, preuzmite medije, objavite na mreži pa označite
            ovde.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? 'Kopirano' : 'Kopiraj tekst'}
            </Button>
            {media.map((m, i) =>
              m.url ? (
                <a key={i} href={m.url} target="_blank" rel="noreferrer" className="self-center underline">
                  Medij {i + 1}
                </a>
              ) : null,
            )}
          </div>
          {canEdit ? (
            <div className="space-y-1">
              <Label htmlFor={`permalink-${t.id}`}>Link objave na mreži (opciono)</Label>
              <Input
                id={`permalink-${t.id}`}
                value={permalink}
                onChange={(e) => setPermalink(e.target.value)}
                placeholder="https://"
              />
              <Button size="sm" onClick={() => onAssistedDone(permalink.trim())} disabled={busy}>
                Označi kao objavljeno
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Rezultat kontrole kvaliteta Autopilota (faza 10c): zašto je nacrt vraćen ili da je prošao. */
function QaReportBox({
  report,
}: {
  report: { passed: boolean; checks: Array<{ name: string; ok: boolean; message: string }> }
}) {
  const failed = report.checks.filter((c) => !c.ok)
  if (report.passed) {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Autopilot: nacrt je prošao kontrolu kvaliteta (dužina, zabranjene reči, pismo, sličnost, brojke iz
        profila, vizual).
      </p>
    )
  }
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <p className="font-medium">
        Autopilot je vratio nacrt na doradu. Ispravite tekst pa ga pošaljite na odobrenje:
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {failed.map((c) => (
          <li key={c.name}>{c.message}</li>
        ))}
      </ul>
    </div>
  )
}
