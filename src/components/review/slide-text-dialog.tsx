'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, HttpError } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SLIDE_TEXT_LIMITS } from '@/lib/schemas/slide-text'
import { cn } from '@/lib/utils'

/**
 * Tekst na slikama (D-129): polja za tekst svakog slajda ili kadra videa, pregled uživo sa servera
 * (u temi objave, sa istom fotografijom) i čuvanje koje ponovo crta samo izmenjene slajdove.
 */
type Kind = 'cover' | 'point' | 'cta'

interface TextView {
  postId: string
  version: number
  format: 'carousel' | 'single' | 'story' | 'video'
  width: number
  height: number
  slides: Array<{
    kind: Kind
    kicker: string | null
    title: string
    body: string | null
    stat: string | null
    items: string[] | null
    /** delovi pored naslova koje stil na tom slajdu crta */
    fields: Array<'kicker' | 'body' | 'stat' | 'items'>
  }>
}

interface SlideForm {
  kind: Kind
  kicker: string
  title: string
  body: string
  stat: string
  /** stavke, jedna po redu */
  items: string
}

export interface SlideTextSaved {
  version: number
  changed: number
  /** slajd koji je bio otvoren, da ga pregled objave pokaže */
  index: number
}

const toForm = (s: TextView['slides'][number]): SlideForm => ({
  kind: s.kind,
  kicker: s.kicker ?? '',
  title: s.title,
  body: s.body ?? '',
  stat: s.stat ?? '',
  items: (s.items ?? []).join('\n'),
})

const toPayload = (f: SlideForm) => ({
  kicker: f.kicker.trim() || null,
  title: f.title,
  body: f.body.trim() || null,
  stat: f.stat.trim() || null,
  items: f.items
    .split('\n')
    .map((i) => i.trim().slice(0, SLIDE_TEXT_LIMITS.item))
    .filter(Boolean)
    .slice(0, SLIDE_TEXT_LIMITS.items),
})

/**
 * Pregled slajda sa tekstom koji se kuca: zahtev ide kad korisnik zastane, a već viđen tekst se ne
 * traži ponovo. Dok stiže nov, ostaje poslednji pregled istog slajda.
 */
function useSlidePreview(postId: string, index: number, form: SlideForm) {
  const payload = toPayload(form)
  const key = JSON.stringify([index, payload])
  const valid = Boolean(form.title.trim())
  const [images, setImages] = useState<Record<string, string>>({})
  const [latest, setLatest] = useState<Record<number, string>>({})
  const [failed, setFailed] = useState<{ key: string; error: unknown } | null>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    if (!valid || images[key]) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(
      () =>
        void (async () => {
          try {
            const res = await fetch(`/api/approvals/${postId}/slides/preview`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ index, slide: JSON.parse(key)[1] }),
              signal: ctrl.signal,
            })
            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
              throw data?.error?.message ? new Error(data.error.message) : new HttpError(res.status)
            }
            const url = URL.createObjectURL(await res.blob())
            urls.current.push(url)
            setImages((cur) => ({ ...cur, [key]: url }))
            setLatest((cur) => ({ ...cur, [index]: key }))
          } catch (error) {
            if (!ctrl.signal.aborted) setFailed({ key, error })
          }
        })(),
      latest[index] ? 450 : 0,
    )
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [postId, index, key, valid, images, latest])

  // privremeni linkovi pregleda se oslobađaju kad se prozor zatvori
  useEffect(() => {
    const list = urls.current
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const shownKey = images[key] ? key : latest[index]
  return {
    url: shownKey ? (images[shownKey] ?? null) : null,
    pending: valid && !images[key] && failed?.key !== key,
    error: failed?.key === key ? failed.error : null,
  }
}

function Editor({
  view,
  onStatus,
  onCancel,
  onSaved,
}: {
  view: TextView
  onStatus: (status: { dirty: boolean; busy: boolean }) => void
  onCancel: () => void
  onSaved: (saved: SlideTextSaved) => void
}) {
  const t = useTranslations('review.slideText')
  const qc = useQueryClient()
  const video = view.format === 'video'
  const initial = useMemo(() => view.slides.map(toForm), [view])
  const [forms, setForms] = useState(initial)
  const [index, setIndex] = useState(0)
  const form = forms[index]!
  const fields = view.slides[index]!.fields
  const changed = forms.map((f, i) => JSON.stringify(f) !== JSON.stringify(initial[i]))
  const dirty = changed.some(Boolean)
  const missingTitle = forms.findIndex((f) => !f.title.trim())
  const preview = useSlidePreview(view.postId, index, form)

  const save = useMutation({
    mutationFn: async () => {
      const slides = forms.map(toPayload)
      let version = view.version
      let changed = 0
      // server crta koliko stigne za 15 sekundi; ostatak ide u sledećem zahtevu, sa novom verzijom
      for (;;) {
        const r = await api<{ version: number; changed: number; rest: number }>(
          `/api/approvals/${view.postId}/slides`,
          { method: 'PUT', json: { version, slides } },
        )
        version = r.version
        changed += r.changed
        if (!r.rest || !r.changed) break
      }
      return { version, changed }
    },
    onSuccess: (r) => {
      // video bez MP4 ide odmah u red za pravljenje, ne posle sledećeg osvežavanja liste
      if (video) void qc.invalidateQueries({ queryKey: ['theme-videos'] })
      onSaved({ ...r, index })
    },
  })

  useEffect(() => onStatus({ dirty, busy: save.isPending }), [dirty, save.isPending, onStatus])

  const set = (patch: Partial<SlideForm>) =>
    setForms((cur) => cur.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  const label = (i: number) => t(video ? 'scene' : 'slide', { n: i + 1 })
  const kindLabel = video
    ? t(form.kind === 'cta' ? 'sceneKinds.cta' : index === 0 ? 'sceneKinds.first' : 'sceneKinds.text')
    : t(`kinds.${form.kind}`)
  // samo delovi koje stil na ovom slajdu crta (server to proveri za svaki slajd)
  const showKicker = fields.includes('kicker')
  const showBody = fields.includes('body')
  const showStat = fields.includes('stat')
  const showItems = fields.includes('items')
  const counter = (value: string, max: number) => (
    <span className="text-xs text-muted-foreground tabular-nums">
      {value.length} / {max}
    </span>
  )

  return (
    <div className="space-y-4">
      {forms.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t(video ? 'titleVideo' : 'title')}>
          {forms.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t(video ? 'sceneOf' : 'slideOf', { n: i + 1, total: forms.length })}
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                i === index && 'border-primary bg-primary/10 text-primary',
              )}
            >
              {label(i)}
              {changed[i] ? <span aria-label={t('changed')}> •</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-lg bg-muted"
            // pregled ne prelazi 45 % visine ekrana, pa ispod njega na telefonu ostaju i polja
            style={{
              aspectRatio: `${view.width} / ${view.height}`,
              maxWidth: `calc(45dvh * ${view.width / view.height})`,
            }}
          >
            {preview.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- privremen link pregleda
              <img
                src={preview.url}
                alt={t(video ? 'previewScene' : 'preview', { n: index + 1 })}
                className={cn('size-full object-contain transition-opacity', preview.pending && 'opacity-70')}
              />
            ) : null}
            {preview.pending ? (
              <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/90 shadow">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              </span>
            ) : null}
          </div>
          <p role="status" className="min-h-4 text-center text-xs text-muted-foreground">
            {preview.pending ? t('previewing') : null}
          </p>
          <ErrorBox error={preview.error} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{kindLabel}</p>
          {showKicker ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="slide-kicker">{t('fields.kicker')}</Label>
                {counter(form.kicker, SLIDE_TEXT_LIMITS.kicker)}
              </div>
              <Input
                id="slide-kicker"
                value={form.kicker}
                maxLength={SLIDE_TEXT_LIMITS.kicker}
                onChange={(e) => set({ kicker: e.target.value })}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="slide-title">{t('fields.title')}</Label>
              {counter(form.title, SLIDE_TEXT_LIMITS.title)}
            </div>
            <Input
              id="slide-title"
              value={form.title}
              maxLength={SLIDE_TEXT_LIMITS.title}
              aria-invalid={!form.title.trim()}
              onChange={(e) => set({ title: e.target.value })}
            />
            {!form.title.trim() ? <p className="text-xs text-destructive">{t('titleRequired')}</p> : null}
          </div>
          {showBody ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="slide-body">{t('fields.body')}</Label>
                {counter(form.body, SLIDE_TEXT_LIMITS.body)}
              </div>
              <Textarea
                id="slide-body"
                rows={4}
                value={form.body}
                maxLength={SLIDE_TEXT_LIMITS.body}
                onChange={(e) => set({ body: e.target.value })}
              />
            </div>
          ) : null}
          {showStat ? (
            <div className="space-y-1.5">
              <Label htmlFor="slide-stat">{t('fields.stat')}</Label>
              <Input
                id="slide-stat"
                value={form.stat}
                maxLength={SLIDE_TEXT_LIMITS.stat}
                onChange={(e) => set({ stat: e.target.value })}
              />
            </div>
          ) : null}
          {showItems ? (
            <div className="space-y-1.5">
              <Label htmlFor="slide-items">{t('fields.items')}</Label>
              <Textarea
                id="slide-items"
                rows={4}
                value={form.items}
                onChange={(e) => set({ items: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('itemsHint', { max: SLIDE_TEXT_LIMITS.items })}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <ErrorBox error={save.error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {save.isPending ? (
          <p role="status" className="mr-auto flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {t(video ? 'savingVideo' : 'saving')}
          </p>
        ) : null}
        <Button variant="outline" disabled={save.isPending} onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={!dirty || missingTitle >= 0 || save.isPending} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </div>
    </div>
  )
}

export function SlideTextDialog({
  open,
  onOpenChange,
  postId,
  video,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  video: boolean
  onSaved: (saved: SlideTextSaved) => void
}) {
  const t = useTranslations('review.slideText')
  const query = useQuery({
    queryKey: ['slide-text', postId],
    queryFn: () => api<TextView>(`/api/approvals/${postId}/slides`),
    enabled: open,
    gcTime: 0,
    // nova verzija bi napravila nov obrazac i obrisala otkucan tekst; sukob javlja čuvanje (409)
    refetchOnWindowFocus: false,
  })
  const status = useRef({ dirty: false, busy: false })
  const onStatus = useCallback((s: { dirty: boolean; busy: boolean }) => {
    status.current = s
  }, [])
  const close = () => {
    if (status.current.busy) return
    if (status.current.dirty && !window.confirm(t('discard'))) return
    status.current = { dirty: false, busy: false }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(video ? 'titleVideo' : 'title')}</DialogTitle>
          <DialogDescription>{t(video ? 'descriptionVideo' : 'description')}</DialogDescription>
        </DialogHeader>
        {query.data ? (
          <Editor
            key={query.data.version}
            view={query.data}
            onStatus={onStatus}
            onCancel={close}
            onSaved={(saved) => {
              status.current = { dirty: false, busy: false }
              onSaved(saved)
            }}
          />
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : (
          <div className="h-72 animate-pulse rounded-lg bg-muted" />
        )}
      </DialogContent>
    </Dialog>
  )
}
