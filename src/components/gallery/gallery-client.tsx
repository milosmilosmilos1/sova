'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  FolderOpen,
  ImagePlus,
  Images,
  Pencil,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { BulkBar, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { uploadMediaFile } from '@/lib/media/client-upload'
import { DESCRIPTION_MAX } from '@/lib/schemas/gallery'
import { cn } from '@/lib/utils'

interface GalleryItem {
  id: string
  url: string
  width: number | null
  height: number | null
  description: string | null
  tags: string[]
  categoryId: string | null
  source: string
  createdAt: string
  lastUsedAt: string | null
}

interface GalleryView {
  items: GalleryItem[]
  categories: Array<{ id: string; name: string; count: number }>
  stats: { total: number; categories: number; described: number; missing: number; uncategorized: number }
  describePrice: number
}

type Edit = { description?: string; categoryId?: string | null }
type Filter = 'all' | 'none' | string

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

/**
 * Galerija brenda (D-114): fotografije sa kategorijama i opisom koji pomaže Sovi da za temu izabere
 * pravu fotografiju. Izmene opisa i kategorije se skupljaju i čuvaju jednim klikom.
 */
export function GalleryClient({
  brandId,
  canEdit,
  emailVerified,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('gallery')
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [preview, setPreview] = useState<GalleryItem | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const [describing, setDescribing] = useState<{ done: number; total: number } | null>(null)
  const [describeError, setDescribeError] = useState<unknown>(null)
  const input = useRef<HTMLInputElement>(null)

  const key = ['gallery', brandId, filter]
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api<GalleryView>(`/api/gallery?brandId=${brandId}${filter === 'all' ? '' : `&category=${filter}`}`),
  })
  const view = query.data
  const refresh = () => qc.invalidateQueries({ queryKey: ['gallery', brandId] })
  const dirty = Object.keys(edits).length

  const save = useMutation({
    mutationFn: () =>
      api(`/api/gallery`, {
        method: 'PATCH',
        json: { brandId, items: Object.entries(edits).map(([id, e]) => ({ id, ...e })) },
      }),
    onSuccess: async () => {
      setEdits({})
      await refresh()
    },
  })
  const addCategory = useMutation({
    mutationFn: () =>
      api(`/api/gallery/categories`, { method: 'POST', json: { brandId, name: newCategory.trim() } }),
    onSuccess: async () => {
      setNewCategory('')
      await refresh()
    },
  })
  const renameCategory = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      api(`/api/gallery/categories/${v.id}`, { method: 'PATCH', json: { name: v.name } }),
    onSuccess: refresh,
  })
  const deleteCategory = useMutation({
    mutationFn: (id: string) => api(`/api/gallery/categories/${id}`, { method: 'DELETE' }),
    onSuccess: async (_d, id) => {
      if (filter === id) setFilter('all')
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/media/${id}`, { method: 'DELETE' }),
    onSuccess: async (_d, id) => {
      setEdits((cur) => {
        const next = { ...cur }
        delete next[id]
        return next
      })
      setPreview(null)
      await refresh()
    },
  })

  // označavanje više fotografija (D-119): brisanje i premeštanje u kategoriju odjednom
  const tb = useTranslations('bulk')
  const selection = useSelection(canEdit ? (view?.items ?? []).map((i) => i.id) : [])
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ done: string[]; failed: Array<{ id: string; message: string }> }>('/api/gallery/delete', {
        method: 'POST',
        json: { brandId, ids },
      }),
    onSuccess: async (r) => {
      setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => !r.done.includes(id))))
      selection.clear()
      await refresh()
    },
  })
  const bulkMove = useMutation({
    mutationFn: (v: { ids: string[]; categoryId: string | null }) =>
      api('/api/gallery', {
        method: 'PATCH',
        json: { brandId, items: v.ids.map((id) => ({ id, categoryId: v.categoryId })) },
      }),
    onSuccess: async () => {
      selection.clear()
      await refresh()
    },
  })

  const value = (item: GalleryItem) => ({
    description: edits[item.id]?.description ?? item.description ?? '',
    categoryId: edits[item.id]?.categoryId !== undefined ? edits[item.id]!.categoryId! : item.categoryId,
  })
  const setEdit = (item: GalleryItem, patch: Edit) =>
    setEdits((cur) => {
      const next = { ...(cur[item.id] ?? {}), ...patch }
      // vraćeno na sačuvano: nije izmena
      const same =
        (next.description === undefined || next.description === (item.description ?? '')) &&
        (next.categoryId === undefined || next.categoryId === item.categoryId)
      const out = { ...cur }
      if (same) delete out[item.id]
      else out[item.id] = next
      return out
    })

  const uploadFiles = async (files: File[]) => {
    setUploadError(null)
    const images = files.filter(
      (f) => IMAGE_TYPES.includes(f.type) || /\.(png|jpe?g|webp|heic|heif)$/i.test(f.name),
    )
    if (!images.length) return setUploadError(new Error(t('notImage')))
    setUpload({ done: 0, total: images.length })
    const category = filter !== 'all' && filter !== 'none' ? filter : null
    const created: string[] = []
    try {
      for (const file of images) {
        const asset = await uploadMediaFile(file, { brandId })
        created.push(asset.id)
        setUpload((u) => (u ? { ...u, done: u.done + 1 } : u))
      }
    } catch (err) {
      setUploadError(err)
    } finally {
      // nove fotografije idu u kategoriju koja je otvorena
      if (category && created.length)
        await api(`/api/gallery`, {
          method: 'PATCH',
          json: { brandId, items: created.map((id) => ({ id, categoryId: category })) },
        }).catch((err) => setUploadError(err))
      setUpload(null)
      await refresh()
    }
  }

  const describe = async (ids: string[]) => {
    setDescribeError(null)
    if (!ids.length) return
    setDescribing({ done: 0, total: ids.length })
    try {
      for (let i = 0; i < ids.length; i += 6) {
        const batch = ids.slice(i, i + 6)
        const r = await api<{ described: unknown[]; failed: Array<{ message: string }> }>(
          `/api/gallery/describe`,
          {
            method: 'POST',
            json: { brandId, assetIds: batch },
          },
        )
        setDescribing((d) => (d ? { ...d, done: d.done + batch.length } : d))
        if (r.failed.length) setDescribeError(new Error(r.failed[0]!.message))
      }
    } catch (err) {
      setDescribeError(err)
    } finally {
      setDescribing(null)
      await refresh()
    }
  }

  const missing = (view?.items ?? []).filter((i) => !i.description?.trim() && !edits[i.id]?.description)
  const pill = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!missing.length || Boolean(describing) || !emailVerified}
              onClick={() => void describe(missing.map((i) => i.id))}
              title={emailVerified ? undefined : t('verifyEmail')}
            >
              <Sparkles className="size-4" aria-hidden />
              {describing
                ? t('describing', { done: describing.done, total: describing.total })
                : t('describeAll', {
                    count: missing.length,
                    price: (view?.describePrice ?? 1) * missing.length,
                  })}
            </Button>
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('saving') : t('save', { count: dirty })}
            </Button>
            <Button disabled={Boolean(upload)} onClick={() => input.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              {upload ? t('uploading', { done: upload.done, total: upload.total }) : t('add')}
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={IMAGE_TYPES.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void uploadFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </div>
        ) : null}
      </div>

      <ErrorBox error={query.error ?? save.error ?? uploadError ?? describeError ?? remove.error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Images} label={t('stats.total')} value={view?.stats.total} />
        <Stat icon={FolderOpen} label={t('stats.categories')} value={view?.stats.categories} />
        <Stat icon={Eye} label={t('stats.described')} value={view?.stats.described} />
        <Stat icon={TriangleAlert} label={t('stats.missing')} value={view?.stats.missing} warn />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('categoriesLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={pill(filter === 'all')}
              onClick={() => setFilter('all')}
            >
              {t('all')} <span className="opacity-70">{view?.stats.total ?? ''}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'none'}
              className={pill(filter === 'none')}
              onClick={() => setFilter('none')}
            >
              {t('uncategorized')} <span className="opacity-70">{view?.stats.uncategorized ?? ''}</span>
            </button>
            {(view?.categories ?? []).map((c) => (
              <span key={c.id} className="inline-flex items-center">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === c.id}
                  className={pill(filter === c.id)}
                  onClick={() => setFilter(c.id)}
                >
                  {c.name} <span className="opacity-70">{c.count}</span>
                </button>
                {canEdit && filter === c.id ? (
                  <span className="ml-1 inline-flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('renameCategory', { name: c.name })}
                      onClick={() => {
                        const name = window.prompt(t('renamePrompt'), c.name)?.trim()
                        if (name && name !== c.name) renameCategory.mutate({ id: c.id, name })
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('deleteCategory', { name: c.name })}
                      onClick={() => {
                        if (window.confirm(t('confirmDeleteCategory', { name: c.name })))
                          deleteCategory.mutate(c.id)
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          {canEdit ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (newCategory.trim()) addCategory.mutate()
              }}
            >
              <Input
                value={newCategory}
                maxLength={40}
                placeholder={t('newCategory')}
                aria-label={t('newCategory')}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-48"
              />
              <Button type="submit" variant="outline" disabled={!newCategory.trim() || addCategory.isPending}>
                {t('addCategory')}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
      <ErrorBox error={addCategory.error ?? renameCategory.error ?? deleteCategory.error} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {filter === 'all'
                ? t('allPhotos')
                : filter === 'none'
                  ? t('uncategorized')
                  : (view?.categories.find((c) => c.id === filter)?.name ?? '')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('gridHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && view?.items.length ? <SelectAllBox selection={selection} /> : null}
            <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t('count', { count: view?.items.length ?? 0 })}
            </span>
          </div>
        </div>
        {bulkDelete.data?.failed.length ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tb('resultFailed', { done: bulkDelete.data.done.length, failed: bulkDelete.data.failed.length })}{' '}
            {bulkDelete.data.failed[0]!.message}
          </p>
        ) : null}
        <ErrorBox error={bulkDelete.error ?? bulkMove.error} />

        {view && !view.items.length ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : null}
        {!view && !query.error ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : null}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {(view?.items ?? []).map((item) => {
            const v = value(item)
            return (
              <li
                key={item.id}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-xl border bg-card',
                  selection.has(item.id) && 'ring-2 ring-primary',
                )}
              >
                {canEdit ? (
                  <span className="absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-md bg-background/90 shadow">
                    <SelectBox selection={selection} id={item.id} label={v.description || t('photo')} />
                  </span>
                ) : null}
                <button
                  type="button"
                  className="group relative aspect-square overflow-hidden bg-muted"
                  onClick={() => setPreview(item)}
                  aria-label={t('open', { name: v.description || t('photo') })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta */}
                  <img
                    src={item.url}
                    alt={v.description || ''}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {!v.description ? (
                    <span className="absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      {t('noDescription')}
                    </span>
                  ) : null}
                  {edits[item.id] ? (
                    <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {t('unsaved')}
                    </span>
                  ) : null}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <Textarea
                    rows={2}
                    value={v.description}
                    maxLength={DESCRIPTION_MAX}
                    disabled={!canEdit}
                    placeholder={t('descriptionPlaceholder')}
                    aria-label={t('description')}
                    onChange={(e) => setEdit(item, { description: e.target.value })}
                    className="min-h-14 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={v.categoryId ?? ''}
                      disabled={!canEdit}
                      aria-label={t('category')}
                      onChange={(e) => setEdit(item, { categoryId: e.target.value || null })}
                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">{t('uncategorized')}</option>
                      {(view?.categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {canEdit ? (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={Boolean(describing) || !emailVerified}
                          aria-label={t('describeOne')}
                          title={t('describeOne')}
                          onClick={() => void describe([item.id])}
                        >
                          <Sparkles className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          aria-label={t('delete')}
                          title={t('delete')}
                          onClick={() => {
                            if (window.confirm(t('confirmDelete'))) remove.mutate(item.id)
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <BulkBar selection={selection}>
        <label className="sr-only" htmlFor="gallery-move">
          {tb('moveTo')}
        </label>
        <select
          id="gallery-move"
          value=""
          disabled={bulkMove.isPending}
          onChange={(e) => {
            if (!e.target.value) return
            bulkMove.mutate({
              ids: [...selection.selected],
              categoryId: e.target.value === 'none' ? null : e.target.value,
            })
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{tb('moveTo')}</option>
          <option value="none">{tb('noCategory')}</option>
          {(view?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="destructive"
          disabled={bulkDelete.isPending}
          onClick={() =>
            window.confirm(tb('deleteConfirm', { count: selection.count })) &&
            bulkDelete.mutate([...selection.selected])
          }
        >
          <Trash2 aria-hidden />
          {tb('delete')}
        </Button>
      </BulkBar>

      {preview ? (
        <Dialog open onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('previewTitle')}</DialogTitle>
              <DialogDescription>{value(preview).description || t('noDescription')}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta */}
            <img
              src={preview.url}
              alt={value(preview).description || ''}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
            {preview.tags.length ? (
              <p className="text-xs text-muted-foreground">
                {t('tags')}: {preview.tags.join(', ')}
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: LucideIcon
  label: string
  value?: number
  warn?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          warn && value ? 'bg-amber-100 text-amber-800' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value ?? '…'}</p>
      </div>
    </div>
  )
}
