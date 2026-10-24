'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PLATFORMS } from '@/config/platforms'
import { targetStatusLabel } from '@/config/post-labels'
import type { ApiResponse } from '@/lib/api/response'
import type { WorkspaceRole } from '@/lib/auth/workspace'

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
  width: number | null
  height: number | null
  altText: string | null
}
interface Target {
  id: string
  socialAccountId: string
  platform: keyof typeof PLATFORMS
  accountName: string | null
  text: string
  usesMaster: boolean
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
  scheduledFor: string | null
  lockedAt: string | null
  targets: Target[]
  media: Array<{
    mediaAssetId: string
    url: string | null
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
      ? ` ${details.problems.map((p) => `${p.platform}: ${p.problems.join(' ')}`).join(' | ')}`
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
  const d = new Date(iso)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null
  const [date, time] = value.split('T')
  const [y, m, d] = date!.split('-').map(Number)
  const [hh, mm] = time!.split(':').map(Number)
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!))
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  )
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  )
  return new Date(guess.getTime() - (asIfUtc - guess.getTime())).toISOString()
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
  selected: Record<string, { on: boolean; text: string }>
  mediaIds: string[]
  when: string
}

function initialForm(p: PostView | null, timezone: string): FormState {
  const selected: Record<string, { on: boolean; text: string }> = {}
  for (const t of p?.targets ?? [])
    selected[t.socialAccountId] = { on: true, text: t.usesMaster ? '' : t.text }
  return {
    title: p?.title ?? '',
    masterText: p?.masterText ?? '',
    firstComment: p?.firstComment ?? '',
    linkUrl: p?.linkUrl ?? '',
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
  const [comment, setComment] = useState('')
  const [linkUrlCreated, setLinkUrlCreated] = useState<string | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const body = () => ({
    title: form.title || null,
    masterText: form.masterText,
    firstComment: form.firstComment || null,
    linkUrl: form.linkUrl || null,
    targets: Object.entries(form.selected)
      .filter(([, v]) => v.on)
      .map(([socialAccountId, v]) => ({ socialAccountId, text: v.text || undefined })),
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
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('brandId', brandId)
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
      const data = (await res.json()) as ApiResponse<MediaItem>
      if (!data.ok) throw new Error(data.error.message)
      return data.data
    },
    onSuccess: (m) => {
      set('mediaIds', [...form.mediaIds, m.id])
      void qc.invalidateQueries({ queryKey: ['media', brandId] })
    },
  })

  const actions = p?.actions ?? []
  const editable = canEdit && (!p || actions.includes('edit'))
  const hasContent = form.masterText.trim().length > 0 || form.mediaIds.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
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
                <Label htmlFor="p-first">Prvi komentar (Instagram i Facebook, opciono)</Label>
                <Input
                  id="p-first"
                  value={form.firstComment}
                  onChange={(e) => set('firstComment', e.target.value)}
                  maxLength={2200}
                  disabled={!editable}
                />
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
              const sel = form.selected[a.id] ?? { on: false, text: '' }
              return (
                <div key={a.id} className="rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sel.on}
                      disabled={!editable || a.status !== 'active'}
                      onChange={(e) =>
                        set('selected', {
                          ...form.selected,
                          [a.id]: { on: e.target.checked, text: sel.text },
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
                        set('selected', { ...form.selected, [a.id]: { on: true, text: e.target.value } })
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
              Iz biblioteke brenda (upload, Unsplash, šabloni, AI slike) ili otpremite novu fotografiju.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {editable ? (
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={upload.isPending}
                onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
              />
            ) : null}
            <ErrorBox error={upload.error} />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {library.data?.map((m) => {
                const idx = form.mediaIds.indexOf(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!editable}
                    onClick={() =>
                      set(
                        'mediaIds',
                        form.mediaIds.includes(m.id)
                          ? form.mediaIds.filter((x) => x !== m.id)
                          : [...form.mediaIds, m.id],
                      )
                    }
                    className={`relative overflow-hidden rounded-md border ${idx >= 0 ? 'ring-2 ring-primary' : ''}`}
                    title={m.altText ?? ''}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={m.altText ?? ''}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
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

      <aside className="space-y-4">
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
