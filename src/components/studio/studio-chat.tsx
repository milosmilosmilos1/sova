'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp,
  FileImage,
  ImagePlus,
  Images,
  Link2,
  LoaderCircle,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { SovaMark } from '@/components/brand/sova-logo'
import { DetailPanes } from '@/components/review/review-desk'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CONTENT_LOCALES } from '@/config/locales'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { formatsForPlatforms, type PostFormat, type PostFormatChoice } from '@/config/post-formats'
import { uploadMediaFile } from '@/lib/media/client-upload'
import { STUDIO_PHOTOS_MAX, STUDIO_TEXT_MAX } from '@/lib/schemas/studio'
import { findLink } from '@/lib/studio/link'
import { cn } from '@/lib/utils'

/**
 * Studio kao razgovor (D-116): levo razgovor sa Sovom (poruka, fotografije, link, podešavanja
 * sledeće objave), desno objava koju je razgovor napravio ili izmenio, sa istim pregledom i
 * odlukama kao u Odobravanju (opis po mrežama, termin, zakaži, objavi, generiši ponovo).
 */
type Note = 'brief_missing' | 'revise_no_post' | 'revise_locked' | 'revise_empty' | 'slides_locked'

interface Attachment {
  kind: 'photo' | 'link'
  assetId?: string
  url: string | null
  title?: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  body: string
  action: 'reply' | 'create' | 'revise' | 'failed' | null
  postId: string | null
  attachments: Attachment[]
  format: PostFormat | null
  notes: string[]
  noteCodes: Note[]
  suggestions: string[]
  tokens: number
  error: { code: string; message: string } | null
  createdAt: string
}

interface Thread {
  messages: Message[]
  lastPostId: string | null
  prices: { message: number; text: number }
  platforms: SocialPlatform[]
  timezone: string
  topics: string[]
}

interface Turn {
  messages: Message[]
  postId: string | null
  tokensCharged: number
}

interface Photo {
  id: string
  url: string
}

interface GalleryItem {
  id: string
  url: string
  description: string | null
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
const DEFAULT_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook']
const isImage = (f: File) => IMAGE_TYPES.includes(f.type) || /\.(png|jpe?g|webp|heic|heif)$/i.test(f.name)

export function StudioChat({
  workspaceId,
  brandId,
  canEdit,
  emailVerified,
}: {
  workspaceId: string
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('studio')
  const tl = useTranslations('contentLocale')
  const qc = useQueryClient()
  const threadKey = ['studio', brandId]
  const thread = useQuery({
    queryKey: threadKey,
    queryFn: () => api<Thread>(`/api/studio?brandId=${brandId}`),
  })
  const balance = useQuery({
    queryKey: ['tokens', workspaceId],
    queryFn: () => api<{ balance: { available: number } }>(`/api/tokens/balance?workspaceId=${workspaceId}`),
    refetchOnWindowFocus: true,
  })

  // objava desno: izabrana iz razgovora, inače poslednja koju je razgovor napravio
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const postId = selected === undefined ? (thread.data?.lastPostId ?? null) : selected

  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const [dragging, setDragging] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [formatChoice, setFormatChoice] = useState<PostFormatChoice>('auto')
  const [platformsChoice, setPlatformsChoice] = useState<SocialPlatform[] | null>(null)
  const [locale, setLocale] = useState('')
  const [slow, setSlow] = useState(false)
  const keyRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLElement>(null)

  const connected = thread.data?.platforms ?? []
  const platforms = platformsChoice ?? (connected.length ? connected : DEFAULT_PLATFORMS)
  const allowed = formatsForPlatforms(platforms)
  const format: PostFormatChoice =
    formatChoice !== 'auto' && !allowed.includes(formatChoice) ? 'auto' : formatChoice
  const link = findLink(text)
  const prices = thread.data?.prices ?? { message: 1, text: 2 }

  const send = useMutation({
    mutationFn: (vars: { text: string; photos: Photo[]; key: string }) =>
      api<Turn>('/api/studio/messages', {
        method: 'POST',
        headers: { 'idempotency-key': vars.key },
        json: {
          brandId,
          text: vars.text,
          photoIds: vars.photos.map((p) => p.id),
          postId: postId ?? undefined,
          settings: { format, platforms, locale: locale || undefined },
        },
      }),
    onSuccess: (turn) => {
      qc.setQueryData<Thread>(threadKey, (cur) =>
        cur
          ? {
              ...cur,
              messages: [...cur.messages, ...turn.messages],
              lastPostId: turn.postId ?? cur.lastPostId,
            }
          : cur,
      )
      if (turn.postId) {
        setSelected(turn.postId)
        void qc.invalidateQueries({ queryKey: ['review-detail', turn.postId] })
        if (window.matchMedia('(max-width: 1023px)').matches)
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setText('')
      setPhotos([])
      keyRef.current = null
      void qc.invalidateQueries({ queryKey: ['tokens', workspaceId] })
    },
  })

  const clear = useMutation({
    mutationFn: () => api(`/api/studio?brandId=${brandId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSelected(null)
      void qc.invalidateQueries({ queryKey: threadKey })
    },
  })

  const messages = thread.data?.messages ?? []
  const pendingText = send.isPending ? send.variables?.text : null

  // nova poruka ili odgovor: razgovor se spušta na dno
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, pendingText])

  // posle šest sekundi čekanja kratko objašnjenje zašto traje
  useEffect(() => {
    if (!send.isPending) return
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [send.isPending])

  const blocked = !canEdit || !emailVerified
  const submit = () => {
    const value = text.trim()
    if (!value || send.isPending || uploading || blocked) return
    keyRef.current ??= crypto.randomUUID()
    send.mutate({ text: value, photos, key: keyRef.current })
  }

  const addFiles = async (files: File[]) => {
    setUploadError(null)
    const images = files.filter(isImage)
    if (!images.length) return setUploadError(new Error(t('composer.notImage')))
    const room = STUDIO_PHOTOS_MAX - photos.length
    if (room <= 0) return setUploadError(new Error(t('composer.maxPhotos')))
    setUploading(true)
    try {
      for (const file of images.slice(0, room)) {
        const asset = await uploadMediaFile(file, { brandId })
        setPhotos((cur) => [...cur, { id: asset.id, url: asset.url }])
      }
      if (images.length > room) setUploadError(new Error(t('composer.maxPhotos')))
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  const fill = (value: string) => {
    setText(value)
    keyRef.current = null
    inputRef.current?.focus()
  }

  const ideas = [
    ...(thread.data?.topics ?? []).slice(0, 2).map((topic) => t('ideas.topic', { topic })),
    t('ideas.week'),
    t('ideas.tips'),
    t('ideas.story'),
  ].slice(0, 4)
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {balance.data ? (
            <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
              {t('balance', { count: balance.data.balance.available })}
            </span>
          ) : null}
          <Button variant="outline" nativeButton={false} render={<Link href="/app/studio/tools" />}>
            <Wrench aria-hidden />
            {t('tools')}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/app/gallery" />}>
            <Images aria-hidden />
            {t('gallery')}
          </Button>
          <Button
            variant="outline"
            disabled={!messages.length || clear.isPending}
            onClick={() => window.confirm(t('confirmClear')) && clear.mutate()}
          >
            <Trash2 aria-hidden />
            {t('clear')}
          </Button>
        </div>
      </div>
      <ErrorBox error={thread.error ?? clear.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section
          aria-label={t('chat.label')}
          className={cn(
            'relative flex h-[75dvh] min-h-[32rem] flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100dvh-13rem)]',
            dragging && 'ring-2 ring-primary',
          )}
          onDragOver={(e) => {
            if (!canEdit || !e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(e) => {
            if (!canEdit) return
            e.preventDefault()
            setDragging(false)
            void addFiles([...e.dataTransfer.files])
          }}
        >
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <SovaMark className="size-9" />
            <div>
              <p className="text-sm font-semibold">{t('chat.title')}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                {t('chat.status')}
              </p>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {thread.isPending ? (
              <div className="space-y-3" aria-hidden>
                <div className="h-14 w-3/4 animate-pulse rounded-xl bg-muted" />
                <div className="ml-auto h-10 w-1/2 animate-pulse rounded-xl bg-muted" />
              </div>
            ) : null}
            {thread.data && !messages.length && !pendingText ? (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-8 text-center">
                <SovaMark className="size-12" />
                <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('empty.text')}</p>
                <div className="w-full space-y-2 pt-2">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {t('ideas.label')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {ideas.map((idea) => (
                      <button
                        key={idea}
                        type="button"
                        disabled={blocked}
                        onClick={() => fill(idea)}
                        className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                open={m.postId !== null && m.postId === postId}
                onOpen={() => setSelected(m.postId)}
                t={t}
              />
            ))}

            {pendingText ? (
              <>
                <div className="ml-auto max-w-[85%] space-y-2">
                  <p className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                    {pendingText}
                  </p>
                  {send.variables?.photos.length ? (
                    <div className="flex justify-end gap-1.5">
                      {send.variables.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                        <img key={p.id} src={p.url} alt="" className="size-14 rounded-lg object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-start gap-2.5">
                  <SovaMark className="size-7" />
                  <div className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm">
                    <p className="flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      {t('message.thinking')}
                    </p>
                    {slow ? <p className="mt-1 text-xs text-muted-foreground">{t('message.slow')}</p> : null}
                  </div>
                </div>
              </>
            ) : null}

            {lastAssistant?.suggestions.length && !send.isPending && !blocked ? (
              <div className="flex flex-wrap gap-2 pl-9">
                {lastAssistant.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => fill(s)}
                    className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
            <fieldset className="space-y-2">
              <legend className="flex w-full items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold tracking-wider text-muted-foreground uppercase">
                  {t('settings.label')}
                </span>
                <span className="text-muted-foreground">{t('settings.hint')}</span>
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="studio-format">
                  {t('settings.format')}
                </label>
                <select
                  id="studio-format"
                  value={format}
                  onChange={(e) => setFormatChoice(e.target.value as PostFormatChoice)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="auto">{t('formats.auto')}</option>
                  {allowed.map((f) => (
                    <option key={f} value={f}>
                      {t(`formats.${f}`)}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="studio-locale">
                  {t('settings.locale')}
                </label>
                <select
                  id="studio-locale"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{t('settings.brandLocale')}</option>
                  {CONTENT_LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {tl(l)}
                    </option>
                  ))}
                </select>
                {!thread.data ? null : connected.length ? (
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('settings.networks')}>
                    {connected.map((p) => {
                      const on = platforms.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPlatformsChoice(on ? platforms.filter((x) => x !== p) : [...platforms, p])
                          }
                          disabled={on && platforms.length === 1}
                          className={cn(
                            'h-8 rounded-md border px-2 text-xs',
                            on
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'bg-background text-muted-foreground',
                          )}
                        >
                          {PLATFORMS[p].label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('settings.noAccounts')}{' '}
                    <Link href="/app/accounts" className="text-primary hover:underline">
                      {t('settings.connect')}
                    </Link>
                  </p>
                )}
              </div>
            </fieldset>

            {photos.length || uploading ? (
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta */}
                    <img
                      src={p.url}
                      alt={t('message.photo')}
                      className="size-14 rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                      aria-label={t('composer.remove')}
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-background shadow"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
                {uploading ? (
                  <span className="grid size-14 place-items-center rounded-lg border border-dashed">
                    <LoaderCircle className="size-4 animate-spin" aria-label={t('composer.uploading')} />
                  </span>
                ) : null}
              </div>
            ) : null}
            {link ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="size-3.5" aria-hidden />
                {t('composer.link')}
              </p>
            ) : null}

            <form
              className="rounded-xl border bg-background focus-within:ring-2 focus-within:ring-ring"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <label htmlFor="studio-input" className="sr-only">
                {t('composer.label')}
              </label>
              <textarea
                id="studio-input"
                ref={inputRef}
                value={text}
                rows={3}
                maxLength={STUDIO_TEXT_MAX}
                disabled={blocked}
                placeholder={
                  !canEdit
                    ? t('composer.readOnly')
                    : !emailVerified
                      ? t('composer.verify')
                      : t('composer.placeholder')
                }
                onChange={(e) => {
                  setText(e.target.value)
                  keyRef.current = null
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit()
                  }
                }}
                onPaste={(e) => {
                  const files = [...e.clipboardData.files].filter(isImage)
                  if (files.length) {
                    e.preventDefault()
                    void addFiles(files)
                  }
                }}
                className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={blocked || uploading || photos.length >= STUDIO_PHOTOS_MAX}
                    onClick={() => fileRef.current?.click()}
                    aria-label={t('composer.upload')}
                    title={t('composer.upload')}
                  >
                    <ImagePlus aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={blocked || photos.length >= STUDIO_PHOTOS_MAX}
                    onClick={() => setPickerOpen(true)}
                    aria-label={t('composer.fromGallery')}
                    title={t('composer.fromGallery')}
                  >
                    <Images aria-hidden />
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={IMAGE_TYPES.join(',')}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      void addFiles([...(e.target.files ?? [])])
                      e.target.value = ''
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  size="icon-sm"
                  disabled={blocked || !text.trim() || send.isPending || uploading}
                  aria-label={t('composer.send')}
                  title={t('composer.send')}
                >
                  {send.isPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <ArrowUp aria-hidden />
                  )}
                </Button>
              </div>
            </form>
            <ErrorBox error={send.error ?? uploadError} />
            <p className="text-[11px] text-muted-foreground">
              {t('composer.price', { message: prices.message, text: prices.text })}
            </p>
          </div>
          {dragging ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-primary/5 text-sm font-medium text-primary">
              {t('composer.drop')}
            </div>
          ) : null}
        </section>

        <section ref={resultRef} aria-label={t('result.label')} className="min-w-0 space-y-3">
          {postId && thread.data ? (
            <div className={cn('space-y-3 transition-opacity', send.isPending && 'opacity-60')}>
              <DetailPanes
                key={postId}
                postId={postId}
                timeZone={thread.data.timezone}
                textPrice={prices.text}
                onChanged={() => void qc.invalidateQueries({ queryKey: ['tokens', workspaceId] })}
              />
            </div>
          ) : (
            <div className="grid min-h-[24rem] place-items-center rounded-xl border border-dashed bg-card p-8 text-center lg:h-[calc(100dvh-13rem)]">
              <div className="max-w-sm space-y-3">
                <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  {send.isPending ? (
                    <LoaderCircle className="size-6 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-6" aria-hidden />
                  )}
                </span>
                <h2 className="text-lg font-semibold">
                  {send.isPending ? t('result.working') : t('result.empty.title')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('result.empty.text')}</p>
                <p className="inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {t('result.next', { format: t(`formats.${format}`) })}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <GalleryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        brandId={brandId}
        chosen={photos}
        onChange={setPhotos}
        t={t}
      />
    </div>
  )
}

function MessageBubble({
  message: m,
  open,
  onOpen,
  t,
}: {
  message: Message
  open: boolean
  onOpen: () => void
  t: ReturnType<typeof useTranslations<'studio'>>
}) {
  if (m.role === 'user')
    return (
      <div className="ml-auto max-w-[85%] space-y-2">
        <p className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
          {m.body}
        </p>
        {m.attachments.length ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {m.attachments.map((a, i) =>
              a.kind === 'photo' ? (
                a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                  <img
                    key={a.assetId ?? i}
                    src={a.url}
                    alt={t('message.photo')}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : null
              ) : (
                <span
                  key={a.url ?? i}
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                >
                  <Link2 className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{a.title || a.url}</span>
                </span>
              ),
            )}
          </div>
        ) : null}
      </div>
    )
  return (
    <div className="flex items-start gap-2.5">
      <SovaMark className="size-7" />
      <div className="max-w-[90%] min-w-0 space-y-2">
        <p className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {m.body}
        </p>
        {m.postId && (m.action === 'create' || m.action === 'revise') ? (
          <button
            type="button"
            onClick={onOpen}
            aria-pressed={open}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-xs',
              open ? 'border-primary text-primary' : 'hover:bg-muted',
            )}
          >
            <FileImage className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 font-medium">
              {m.action === 'create'
                ? t('message.created', { format: t(`formats.${m.format ?? 'auto'}`) })
                : t('message.revised')}
            </span>
            <span>{open ? t('message.opened') : t('message.open')}</span>
          </button>
        ) : null}
        {m.action === 'failed' && m.error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {t('message.failed')}: {m.error.message}
          </p>
        ) : null}
        {m.noteCodes.length || m.notes.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {m.noteCodes.map((n) => (
              <li key={n}>{t(`notes.${n}`)}</li>
            ))}
            {m.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {m.tokens ? (
          <p className="text-[11px] text-muted-foreground">{t('message.tokens', { count: m.tokens })}</p>
        ) : null}
      </div>
    </div>
  )
}

function GalleryPicker({
  open,
  onOpenChange,
  brandId,
  chosen,
  onChange,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandId: string
  chosen: Photo[]
  onChange: (photos: Photo[]) => void
  t: ReturnType<typeof useTranslations<'studio'>>
}) {
  const gallery = useQuery({
    queryKey: ['gallery', brandId, 'all'],
    queryFn: () => api<{ items: GalleryItem[] }>(`/api/gallery?brandId=${brandId}`),
    enabled: open,
  })
  const items = gallery.data?.items ?? []
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('picker.title')}</DialogTitle>
          <DialogDescription>{t('picker.description')}</DialogDescription>
        </DialogHeader>
        <ErrorBox error={gallery.error} />
        {gallery.data && !items.length ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('picker.empty')}
          </p>
        ) : null}
        <ul className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {items.map((item) => {
            const on = chosen.some((p) => p.id === item.id)
            const full = !on && chosen.length >= STUDIO_PHOTOS_MAX
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() =>
                    onChange(
                      on
                        ? chosen.filter((p) => p.id !== item.id)
                        : [...chosen, { id: item.id, url: item.url }],
                    )
                  }
                  className={cn(
                    'relative block aspect-square w-full overflow-hidden rounded-lg border-2 disabled:opacity-40',
                    on ? 'border-primary' : 'border-transparent',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta */}
                  <img
                    src={item.url}
                    alt={item.description ?? ''}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t('picker.selected', { count: chosen.length })}</p>
          <Button onClick={() => onOpenChange(false)}>{t('picker.done')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
