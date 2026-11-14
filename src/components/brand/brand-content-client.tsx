'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageIcon, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { GalleryPhotoPicker, type PickedPhoto } from '@/components/shared/gallery-photo-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CONTENT_KINDS,
  DATA_KINDS,
  TESTIMONIAL_SOURCES,
  type ContentKind,
  type ContentList,
  type KindState,
} from '@/lib/schemas/brand-content'
import { cn } from '@/lib/utils'

interface Testimonial {
  id: string
  author: string
  detail: string | null
  text: string
  rating: number | null
  source: (typeof TESTIMONIAL_SOURCES)[number]
  date: string | null
}
interface TeamMember {
  id: string
  name: string
  role: string
  bio: string | null
  funFact: string | null
  photoAssetId: string | null
  photoUrl: string | null
}
interface Pair {
  id: string
  title: string
  note: string | null
  beforeAssetId: string
  afterAssetId: string
  beforeUrl: string | null
  afterUrl: string | null
}
interface ContentView {
  kinds: Record<ContentKind, KindState>
  testimonials: Testimonial[]
  team: TeamMember[]
  pairs: Pair[]
  canEdit: boolean
}

/** Zajedničko za tri liste: čuvanje vraća `true` kad uspe, a greška ostaje u formi te liste. */
interface ListProps {
  canEdit: boolean
  busy: boolean
  error: unknown
  onSave: (id: string | null, item: Record<string, unknown>) => Promise<boolean>
  onRemove: (id: string) => void
  onReset: () => void
}

const STATES: KindState[] = ['auto', 'on', 'off']

/**
 * Vrste objava brenda (D-165): prekidač po vrsti i podaci od kojih Sova pravi utiske klijenata,
 * predstavljanje tima i pre i posle. Sova te tri vrste pravi samo iz ovih podataka.
 */
export function BrandContentClient({ brandId }: { brandId: string }) {
  const t = useTranslations('brandContent')
  const qc = useQueryClient()
  const key = ['brand-content', brandId]
  const view = useQuery({
    queryKey: key,
    queryFn: () => api<ContentView>(`/api/brands/${brandId}/content`),
  })
  const done = (data: ContentView) => qc.setQueryData(key, data)
  const kinds = useMutation({
    mutationFn: (patch: Partial<Record<ContentKind, KindState>>) =>
      api<ContentView>(`/api/brands/${brandId}/content`, { method: 'PATCH', json: { kinds: patch } }),
    onSuccess: done,
  })
  const save = useMutation({
    mutationFn: (input: { list: ContentList; id: string | null; item: Record<string, unknown> }) =>
      api<ContentView>(
        input.id
          ? `/api/brands/${brandId}/content/${input.list}/${input.id}`
          : `/api/brands/${brandId}/content/${input.list}`,
        { method: input.id ? 'PATCH' : 'POST', json: input.item },
      ),
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: (input: { list: ContentList; id: string }) =>
      api<ContentView>(`/api/brands/${brandId}/content/${input.list}/${input.id}`, { method: 'DELETE' }),
    onSuccess: done,
  })

  const data = view.data
  if (!data)
    return view.error ? (
      <ErrorBox error={view.error} />
    ) : (
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    )
  const canEdit = data.canEdit
  const count = (kind: ContentKind) =>
    kind === 'review' ? data.testimonials.length : kind === 'team' ? data.team.length : data.pairs.length
  const listProps = (list: ContentList): ListProps => ({
    canEdit,
    busy: save.isPending || remove.isPending,
    error: save.variables?.list === list ? save.error : null,
    onSave: (id, item) =>
      save.mutateAsync({ list, id, item }).then(
        () => true,
        () => false,
      ),
    onRemove: (id) => remove.mutate({ list, id }),
    onReset: () => save.reset(),
  })

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
      {!canEdit ? <p className="text-sm text-muted-foreground">{t('readOnly')}</p> : null}
      <ErrorBox error={kinds.error ?? remove.error} />

      <Card>
        <CardHeader>
          <CardTitle>{t('kinds.title')}</CardTitle>
          <CardDescription>{t('kinds.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {CONTENT_KINDS.map((kind) => (
              <li
                key={kind}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{t(`kinds.${kind}.name`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`kinds.${kind}.hint`)}</p>
                  {DATA_KINDS.has(kind) ? (
                    <p className="text-xs text-muted-foreground">
                      {count(kind) ? t('kinds.count', { count: count(kind) }) : t('kinds.needsData')}
                    </p>
                  ) : null}
                </div>
                <div role="group" aria-label={t(`kinds.${kind}.name`)} className="flex shrink-0 gap-1">
                  {STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      aria-pressed={data.kinds[kind] === state}
                      disabled={!canEdit || kinds.isPending}
                      onClick={() => kinds.mutate({ [kind]: state })}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs disabled:opacity-60',
                        data.kinds[kind] === state
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted',
                      )}
                    >
                      {t(`kinds.states.${state}`)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <TestimonialsCard items={data.testimonials} {...listProps('testimonials')} />
      <TeamCard brandId={brandId} items={data.team} {...listProps('team')} />
      <PairsCard brandId={brandId} items={data.pairs} {...listProps('pairs')} />
    </div>
  )
}

/** Stanje forme jedne liste: zatvorena, nova stavka ili izmena postojeće. */
function useEditor<T>(onReset: () => void) {
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  return {
    editing,
    current: editing && editing !== 'new' ? editing : null,
    open: (value: T | 'new') => {
      onReset()
      setEditing(value)
    },
    close: () => setEditing(null),
  }
}

function ListCard({
  title,
  description,
  empty,
  addLabel,
  canEdit,
  editing,
  onAdd,
  form,
  children,
  hasItems,
}: {
  title: string
  description: string
  empty: string
  addLabel: string
  canEdit: boolean
  editing: boolean
  onAdd: () => void
  form: ReactNode
  children: ReactNode
  hasItems: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {canEdit && !editing ? (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? form : null}
        {hasItems ? children : !editing ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      </CardContent>
    </Card>
  )
}

function ItemActions({
  canEdit,
  busy,
  onEdit,
  onRemove,
}: {
  canEdit: boolean
  busy: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const t = useTranslations('brandContent.actions')
  if (!canEdit) return null
  return (
    <div className="flex shrink-0 gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={t('edit')} onClick={onEdit} disabled={busy}>
        <Pencil aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('delete')}
        disabled={busy}
        onClick={() => {
          if (window.confirm(t('confirmDelete'))) onRemove()
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

/** `busy` znači da čuvanje traje (kružić); `blocked` samo gasi dugme dok forma nije spremna. */
function FormActions({
  busy,
  blocked = false,
  error,
  onCancel,
}: {
  busy: boolean
  blocked?: boolean
  error: unknown
  onCancel: () => void
}) {
  const t = useTranslations('brandContent.actions')
  return (
    <div className="space-y-2">
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || blocked}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {t('save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}

const stars = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : null)

function TestimonialsCard({
  items,
  canEdit,
  busy,
  error,
  onSave,
  onRemove,
  onReset,
}: ListProps & { items: Testimonial[] }) {
  const t = useTranslations('brandContent.testimonials')
  const editor = useEditor<Testimonial>(onReset)
  const current = editor.current
  return (
    <ListCard
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      addLabel={t('add')}
      canEdit={canEdit}
      editing={editor.editing !== null}
      onAdd={() => editor.open('new')}
      hasItems={items.length > 0}
      form={
        <form
          key={current?.id ?? 'new'}
          className="space-y-3 rounded-lg border p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const rating = Number(f.get('rating'))
            const saved = await onSave(current?.id ?? null, {
              author: f.get('author'),
              detail: f.get('detail') || null,
              text: f.get('text'),
              rating: rating >= 1 && rating <= 5 ? rating : null,
              source: f.get('source'),
              date: f.get('date') || null,
            })
            if (saved) editor.close()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="t-author" label={t('author')} hint={t('authorHint')}>
              <Input id="t-author" name="author" required maxLength={80} defaultValue={current?.author} />
            </Field>
            <Field id="t-detail" label={t('detail')} hint={t('detailHint')}>
              <Input id="t-detail" name="detail" maxLength={80} defaultValue={current?.detail ?? ''} />
            </Field>
          </div>
          <Field id="t-text" label={t('text')} hint={t('textHint')}>
            <Textarea
              id="t-text"
              name="text"
              required
              minLength={10}
              maxLength={1200}
              rows={4}
              defaultValue={current?.text}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="t-rating" label={t('rating')}>
              <select
                id="t-rating"
                name="rating"
                defaultValue={current?.rating ?? ''}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t('ratingNone')}</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {stars(n)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="t-source" label={t('source')}>
              <select
                id="t-source"
                name="source"
                defaultValue={current?.source ?? 'direct'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {TESTIMONIAL_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sources.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="t-date" label={t('date')}>
              <Input id="t-date" name="date" type="date" defaultValue={current?.date ?? ''} />
            </Field>
          </div>
          <FormActions busy={busy} error={error} onCancel={editor.close} />
        </form>
      }
    >
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="line-clamp-3">„{item.text}”</p>
              <p className="text-xs text-muted-foreground">
                {item.author}
                {item.detail ? `, ${item.detail}` : ''} · {t(`sources.${item.source}`)}
                {item.rating ? ` · ${stars(item.rating)}` : ''}
              </p>
            </div>
            <ItemActions
              canEdit={canEdit}
              busy={busy}
              onEdit={() => editor.open(item)}
              onRemove={() => onRemove(item.id)}
            />
          </li>
        ))}
      </ul>
    </ListCard>
  )
}

function PhotoSlot({
  brandId,
  label,
  value,
  url,
  onPick,
}: {
  brandId: string
  label: string
  value: string | null
  url: string | null
  onPick: (photo: PickedPhoto) => void
}) {
  const t = useTranslations('brandContent')
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid aspect-square w-32 place-items-center overflow-hidden rounded-lg border border-dashed bg-muted text-xs text-muted-foreground"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
          <img src={url} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 p-2">
            <ImageIcon className="size-5" aria-hidden />
            {t('choosePhoto')}
          </span>
        )}
      </button>
      <GalleryPhotoPicker
        open={open}
        onOpenChange={setOpen}
        brandId={brandId}
        value={value}
        onPick={onPick}
      />
    </div>
  )
}

function TeamCard({
  brandId,
  items,
  canEdit,
  busy,
  error,
  onSave,
  onRemove,
  onReset,
}: ListProps & { brandId: string; items: TeamMember[] }) {
  const t = useTranslations('brandContent.team')
  const editor = useEditor<TeamMember>(onReset)
  const current = editor.current
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const start = (value: TeamMember | 'new') => {
    editor.open(value)
    setPhoto(
      value !== 'new' && value.photoAssetId ? { id: value.photoAssetId, url: value.photoUrl ?? '' } : null,
    )
  }
  return (
    <ListCard
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      addLabel={t('add')}
      canEdit={canEdit}
      editing={editor.editing !== null}
      onAdd={() => start('new')}
      hasItems={items.length > 0}
      form={
        <form
          key={current?.id ?? 'new'}
          className="space-y-3 rounded-lg border p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const saved = await onSave(current?.id ?? null, {
              name: f.get('name'),
              role: f.get('role'),
              bio: f.get('bio') || null,
              funFact: f.get('funFact') || null,
              photoAssetId: photo?.id ?? null,
            })
            if (saved) editor.close()
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <PhotoSlot
              brandId={brandId}
              label={t('photo')}
              value={photo?.id ?? null}
              url={photo?.url || null}
              onPick={setPhoto}
            />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <Field id="m-name" label={t('name')}>
                <Input id="m-name" name="name" required maxLength={80} defaultValue={current?.name} />
              </Field>
              <Field id="m-role" label={t('role')} hint={t('roleHint')}>
                <Input id="m-role" name="role" required maxLength={80} defaultValue={current?.role} />
              </Field>
            </div>
          </div>
          <Field id="m-bio" label={t('bio')} hint={t('bioHint')}>
            <Textarea id="m-bio" name="bio" maxLength={600} rows={3} defaultValue={current?.bio ?? ''} />
          </Field>
          <Field id="m-fun" label={t('funFact')} hint={t('funFactHint')}>
            <Input id="m-fun" name="funFact" maxLength={200} defaultValue={current?.funFact ?? ''} />
          </Field>
          <FormActions busy={busy} error={error} onCancel={editor.close} />
        </form>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                <img src={item.photoUrl} alt={item.name} className="size-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground" aria-hidden>
                  {item.name.slice(0, 1)}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.role}
                {!item.photoUrl ? ` · ${t('noPhoto')}` : ''}
              </p>
            </div>
            <ItemActions
              canEdit={canEdit}
              busy={busy}
              onEdit={() => start(item)}
              onRemove={() => onRemove(item.id)}
            />
          </li>
        ))}
      </ul>
    </ListCard>
  )
}

function PairsCard({
  brandId,
  items,
  canEdit,
  busy,
  error,
  onSave,
  onRemove,
  onReset,
}: ListProps & { brandId: string; items: Pair[] }) {
  const t = useTranslations('brandContent.pairs')
  const editor = useEditor<Pair>(onReset)
  const current = editor.current
  const [before, setBefore] = useState<PickedPhoto | null>(null)
  const [after, setAfter] = useState<PickedPhoto | null>(null)
  const start = (value: Pair | 'new') => {
    editor.open(value)
    setBefore(value !== 'new' ? { id: value.beforeAssetId, url: value.beforeUrl ?? '' } : null)
    setAfter(value !== 'new' ? { id: value.afterAssetId, url: value.afterUrl ?? '' } : null)
  }
  return (
    <ListCard
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      addLabel={t('add')}
      canEdit={canEdit}
      editing={editor.editing !== null}
      onAdd={() => start('new')}
      hasItems={items.length > 0}
      form={
        <form
          key={current?.id ?? 'new'}
          className="space-y-3 rounded-lg border p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!before || !after) return
            const f = new FormData(e.currentTarget)
            const saved = await onSave(current?.id ?? null, {
              title: f.get('title'),
              note: f.get('note') || null,
              beforeAssetId: before.id,
              afterAssetId: after.id,
            })
            if (saved) editor.close()
          }}
        >
          <div className="flex flex-wrap gap-4">
            <PhotoSlot
              brandId={brandId}
              label={t('before')}
              value={before?.id ?? null}
              url={before?.url || null}
              onPick={setBefore}
            />
            <PhotoSlot
              brandId={brandId}
              label={t('after')}
              value={after?.id ?? null}
              url={after?.url || null}
              onPick={setAfter}
            />
          </div>
          {!before || !after ? <p className="text-xs text-muted-foreground">{t('needBoth')}</p> : null}
          <Field id="p-title" label={t('titleLabel')} hint={t('titleHint')}>
            <Input
              id="p-title"
              name="title"
              required
              minLength={3}
              maxLength={100}
              defaultValue={current?.title}
            />
          </Field>
          <Field id="p-note" label={t('note')} hint={t('noteHint')}>
            <Textarea id="p-note" name="note" maxLength={600} rows={3} defaultValue={current?.note ?? ''} />
          </Field>
          <FormActions busy={busy} blocked={!before || !after} error={error} onCancel={editor.close} />
        </form>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <div className="flex shrink-0 gap-1">
              {[item.beforeUrl, item.afterUrl].map((url, i) => (
                <span key={i} className="block size-14 overflow-hidden rounded-md bg-muted">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                    <img
                      src={url}
                      alt={i === 0 ? t('before') : t('after')}
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              {item.note ? <p className="line-clamp-2 text-xs text-muted-foreground">{item.note}</p> : null}
            </div>
            <ItemActions
              canEdit={canEdit}
              busy={busy}
              onEdit={() => start(item)}
              onRemove={() => onRemove(item.id)}
            />
          </li>
        ))}
      </ul>
    </ListCard>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
