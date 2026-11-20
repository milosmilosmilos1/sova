'use client'

import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ImagePlus, Images, LoaderCircle, Plus, Star, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { GalleryPhotoPicker } from '@/components/shared/gallery-photo-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { uploadMediaFile } from '@/lib/media/client-upload'
import { templateValuesSchema } from '@/lib/schemas/templates'
import { TEMPLATES, type FieldDef, type TemplateFormat, type TemplateId } from '@/lib/templates/catalog'
import { cn } from '@/lib/utils'

import { TemplateIcon } from './template-icon'

type Values = Record<string, unknown>

export interface TemplateAccount {
  id: string
  platform: string
  name: string | null
  username: string | null
}

interface Preview {
  slides: string[]
  caption: string
  title: string
}

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const PREVIEW_DELAY_MS = 700

/** Početne vrednosti po vrsti polja; lista počinje sa onoliko redova koliko traži (bar jednim). */
function initialValues(fields: readonly FieldDef[]): Values {
  return Object.fromEntries(
    fields.map((f) => {
      switch (f.kind) {
        case 'photo':
        case 'rating':
          return [f.key, null]
        case 'photos':
          return [f.key, []]
        case 'list':
          return [f.key, Array.from({ length: Math.max(f.minItems ?? 0, 1) }, () => '')]
        case 'pairs':
          return [f.key, [{ q: '', a: '' }]]
        case 'prices':
          return [f.key, [{ name: '', price: '' }]]
        case 'choice':
          return [f.key, 0]
        default:
          return [f.key, '']
      }
    }),
  )
}

/**
 * Forma šablona (D-175): polja iz kataloga, pregled slajdova u stilu brenda dok se kuca, opis koji
 * Sova složi od podataka (korisnik ga menja), mreže i nacrt koji se otvara u editoru za zakazivanje.
 */
export function TemplateEditor({
  templateId,
  brandId,
  canEdit,
  accounts,
}: {
  templateId: TemplateId
  brandId: string
  canEdit: boolean
  accounts: TemplateAccount[]
}) {
  const t = useTranslations('templates')
  const router = useRouter()
  const def = TEMPLATES[templateId]
  const [values, setValues] = useState<Values>(() => initialValues(def.fields))
  const [format, setFormat] = useState<TemplateFormat>(def.formats[0]!)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [caption, setCaption] = useState('')
  const [edited, setEdited] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<unknown>(null)
  const [drawing, setDrawing] = useState(false)

  const schema = useMemo(() => templateValuesSchema(templateId), [templateId])
  const parsed = schema.safeParse(values)
  const errors = useMemo(() => {
    const out: Record<string, string> = {}
    if (parsed.success) return out
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      out[key] ??= issue.message
    }
    return out
  }, [parsed])
  const valid = parsed.success
  const requestKey = JSON.stringify({ values, format })

  useEffect(() => {
    if (!valid) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setDrawing(true)
      api<Preview>(`/api/brands/${brandId}/templates/preview`, {
        method: 'POST',
        json: { templateId, format, values: JSON.parse(requestKey).values },
        signal: ctrl.signal,
      })
        .then((r) => {
          setPreview(r)
          setPreviewError(null)
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setPreviewError(e)
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setDrawing(false)
        })
    }, PREVIEW_DELAY_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [brandId, templateId, format, requestKey, valid])

  const save = useMutation({
    mutationFn: () =>
      api<{ postId: string }>(`/api/brands/${brandId}/templates`, {
        method: 'POST',
        json: { templateId, format, values, caption: edited ? caption : undefined, accountIds: selected },
      }),
    onSuccess: (r) => router.push(`/app/posts/${r.postId}`),
  })

  const set = (key: string, value: unknown) => setValues((cur) => ({ ...cur, [key]: value }))
  const remember = (id: string, url: string) => setUrls((cur) => ({ ...cur, [id]: url }))
  const shownCaption = edited ? caption : (preview?.caption ?? '')
  const disabled = !canEdit || save.isPending

  const submit = () => {
    setSubmitted(true)
    if (!valid) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    save.mutate()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/app/templates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('back')}
        </Link>
        <div className="flex items-start gap-3">
          <TemplateIcon id={templateId} />
          <div className="space-y-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t(`items.${templateId}.name`)}</h1>
            <p className="text-sm text-muted-foreground">{t(`items.${templateId}.description`)}</p>
          </div>
        </div>
        {!canEdit ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t('viewOnly')}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {def.fields.map((field) => (
            <FieldInput
              key={field.key}
              templateId={templateId}
              field={field}
              values={values}
              set={set}
              urls={urls}
              remember={remember}
              brandId={brandId}
              disabled={disabled}
              error={submitted ? errors[field.key] : undefined}
            />
          ))}

          {def.formats.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('ui.format')}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ui.format')}>
                {def.formats.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={format === f}
                    disabled={disabled}
                    onClick={() => setFormat(f)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      format === f
                        ? 'border-primary bg-primary/5 font-medium ring-1 ring-primary'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    {t(`ui.formats.${f}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('ui.accounts')}</legend>
            {accounts.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <label
                      key={a.id}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        disabled={disabled}
                        onChange={(e) =>
                          setSelected((cur) =>
                            e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id),
                          )
                        }
                      />
                      <span className="capitalize">{a.platform.replace('_', ' ')}</span>
                      <span className="text-muted-foreground">{a.username ? `@${a.username}` : a.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('ui.accountsHint')}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ui.noAccounts')}</p>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="template-caption" className="text-sm font-medium">
                {t('ui.caption')}
              </label>
              {edited ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setEdited(false)}
                >
                  {t('ui.captionReset')}
                </button>
              ) : null}
            </div>
            <Textarea
              id="template-caption"
              rows={7}
              maxLength={2200}
              value={shownCaption}
              disabled={disabled}
              onChange={(e) => {
                setCaption(e.target.value)
                setEdited(true)
              }}
            />
            <p className="text-xs text-muted-foreground">{t('ui.captionHint')}</p>
          </div>

          <ErrorBox error={save.error} />
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{t('ui.savedHint')}</p>
            <Button type="submit" disabled={disabled}>
              {save.isPending ? t('ui.saving') : t('ui.save')}
            </Button>
          </div>
        </form>

        <section aria-labelledby="template-preview" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 id="template-preview" className="font-medium">
              {t('ui.preview')}
            </h2>
            {drawing ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                {t('ui.previewLoading')}
              </span>
            ) : null}
          </div>
          <ErrorBox error={previewError} />
          {preview ? (
            // traka se pomera vodoravno, pa mora da primi fokus tastature
            <ol
              tabIndex={0}
              aria-label={t('ui.preview')}
              className={cn(
                'flex snap-x gap-3 overflow-x-auto rounded-lg pb-2 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                (drawing || !valid) && 'opacity-60',
              )}
            >
              {preview.slides.map((src, i) => (
                <li key={`${i}-${src.length}`} className="w-64 shrink-0 snap-start sm:w-72">
                  {/* eslint-disable-next-line @next/next/no-img-element -- slajd stiže kao data URI */}
                  <img
                    src={src}
                    alt={t('ui.slide', { n: i + 1 })}
                    className="w-full rounded-lg border shadow-sm"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('ui.previewEmpty')}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function FieldShell({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string
  label: string
  optional: boolean
  error?: string
  children: ReactNode
}) {
  const t = useTranslations('templates.ui')
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">({t('optional')})</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function FieldInput({
  templateId,
  field,
  values,
  set,
  urls,
  remember,
  brandId,
  disabled,
  error,
}: {
  templateId: TemplateId
  field: FieldDef
  values: Values
  set: (key: string, value: unknown) => void
  urls: Record<string, string>
  remember: (id: string, url: string) => void
  brandId: string
  disabled: boolean
  error?: string
}) {
  const t = useTranslations('templates')
  const id = `tpl-${field.key}`
  // natpis polja: poseban za šablon kad postoji, inače zajednički
  type Key = Parameters<typeof t>[0]
  const own = `items.${templateId}.fields.${field.key}` as Key
  const label = t.has(own) ? t(own) : t(`fields.${field.key}` as Key)
  const optional = !field.required && field.kind !== 'choice'
  const invalid = Boolean(error)
  const aria = { 'aria-invalid': invalid, 'aria-describedby': invalid ? `${id}-error` : undefined }
  const value = values[field.key]

  switch (field.kind) {
    case 'text':
    case 'date':
    case 'time':
      return (
        <FieldShell id={id} label={label} optional={optional} error={error}>
          <Input
            id={id}
            type={field.kind === 'text' ? 'text' : field.kind}
            value={(value as string) ?? ''}
            maxLength={field.max}
            disabled={disabled}
            onChange={(e) => set(field.key, e.target.value)}
            {...aria}
          />
        </FieldShell>
      )
    case 'textarea':
      return (
        <FieldShell id={id} label={label} optional={optional} error={error}>
          <Textarea
            id={id}
            rows={3}
            value={(value as string) ?? ''}
            maxLength={field.max}
            disabled={disabled}
            onChange={(e) => set(field.key, e.target.value)}
            {...aria}
          />
        </FieldShell>
      )
    case 'rating':
      return (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={value === n}
                aria-label={`${n}/5`}
                disabled={disabled}
                onClick={() => set(field.key, n)}
                className="rounded p-1 text-amber-500 disabled:opacity-60"
              >
                <Star
                  className={cn('size-6', typeof value === 'number' && n <= value && 'fill-current')}
                  aria-hidden
                />
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={value === null}
              disabled={disabled}
              onClick={() => set(field.key, null)}
              className="ml-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {t('ui.noRating')}
            </button>
          </div>
        </fieldset>
      )
    case 'choice': {
      // samo popunjeni odgovori, istim redom i slovima kao na slajdu (prazan red se ne objavljuje)
      const answers = ((values.answers as string[] | undefined) ?? []).map((a) => a.trim()).filter(Boolean)
      return (
        <fieldset className="space-y-1.5" aria-describedby={invalid ? `${id}-error` : undefined}>
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {answers.map((a, i) => (
              <label key={i} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                <input
                  type="radio"
                  name={id}
                  checked={value === i}
                  disabled={disabled}
                  onChange={() => set(field.key, i)}
                  aria-invalid={invalid}
                />
                <span className="font-medium">{String.fromCharCode(65 + i)})</span>
                <span className="max-w-48 truncate text-muted-foreground">{a}</span>
              </label>
            ))}
          </div>
          {error ? (
            <p id={`${id}-error`} className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </fieldset>
      )
    }
    case 'list':
      return (
        <ListInput
          id={id}
          label={label}
          optional={optional}
          error={error}
          items={(value as string[]) ?? []}
          max={field.maxItems ?? 5}
          min={field.minItems ?? 0}
          maxLength={field.max ?? 120}
          disabled={disabled}
          onChange={(items) => set(field.key, items)}
          lettered={field.key === 'answers'}
        />
      )
    case 'pairs':
    case 'prices': {
      const rows = (value as Array<Record<string, string>>) ?? []
      const keys = field.kind === 'pairs' ? (['q', 'a'] as const) : (['name', 'price'] as const)
      const names =
        field.kind === 'pairs' ? [t('fields.question'), t('ui.answer')] : [t('ui.item'), t('ui.itemPrice')]
      const max = field.maxItems ?? 5
      return (
        <fieldset className="space-y-2" aria-describedby={invalid ? `${id}-error` : undefined}>
          <legend className="text-sm font-medium">{label}</legend>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-start">
              {keys.map((k, j) => (
                <Input
                  key={k}
                  aria-label={`${names[j]} ${i + 1}`}
                  placeholder={names[j]}
                  value={row[k] ?? ''}
                  maxLength={k === 'a' ? 300 : k === 'q' ? 140 : k === 'price' ? 30 : 60}
                  disabled={disabled}
                  className={cn(k === 'a' || k === 'name' ? 'sm:flex-[2]' : 'sm:flex-1')}
                  onChange={(e) =>
                    set(
                      field.key,
                      rows.map((r, x) => (x === i ? { ...r, [k]: e.target.value } : r)),
                    )
                  }
                  aria-invalid={invalid && !row[k]}
                />
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('ui.remove')}
                disabled={disabled || rows.length <= 1}
                onClick={() =>
                  set(
                    field.key,
                    rows.filter((_, x) => x !== i),
                  )
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          {rows.length < max ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                set(field.key, [...rows, field.kind === 'pairs' ? { q: '', a: '' } : { name: '', price: '' }])
              }
            >
              <Plus className="size-4" aria-hidden />
              {t('ui.add')}
            </Button>
          ) : null}
          {error ? (
            <p id={`${id}-error`} className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </fieldset>
      )
    }
    case 'photo':
    case 'photos': {
      const ids = field.kind === 'photo' ? (value ? [value as string] : []) : ((value as string[]) ?? [])
      const max = field.kind === 'photo' ? 1 : (field.maxItems ?? 6)
      const add = (photoId: string, url: string) => {
        remember(photoId, url)
        set(
          field.key,
          field.kind === 'photo' ? photoId : [...ids.filter((x) => x !== photoId), photoId].slice(0, max),
        )
      }
      const removeAt = (i: number) =>
        set(field.key, field.kind === 'photo' ? null : ids.filter((_, x) => x !== i))
      return (
        <PhotoInput
          id={id}
          label={label}
          optional={optional}
          error={error}
          ids={ids}
          urls={urls}
          max={max}
          brandId={brandId}
          disabled={disabled}
          onAdd={add}
          onRemove={removeAt}
        />
      )
    }
  }
}

function ListInput({
  id,
  label,
  optional,
  error,
  items,
  min,
  max,
  maxLength,
  disabled,
  lettered,
  onChange,
}: {
  id: string
  label: string
  optional: boolean
  error?: string
  items: string[]
  min: number
  max: number
  maxLength: number
  disabled: boolean
  lettered: boolean
  onChange: (items: string[]) => void
}) {
  const t = useTranslations('templates.ui')
  const invalid = Boolean(error)
  // oznaka reda po popunjenim redovima, kao na slajdu: prazan red se ne objavljuje
  let filled = 0
  const marks = items.map((x) =>
    x.trim() ? (lettered ? `${String.fromCharCode(65 + filled++)})` : `${++filled}.`) : '·',
  )
  return (
    <fieldset className="space-y-2" aria-describedby={invalid ? `${id}-error` : undefined}>
      <legend className="text-sm font-medium">
        {label}
        {optional ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">({t('optional')})</span>
        ) : null}
      </legend>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-sm text-muted-foreground" aria-hidden>
            {marks[i]}
          </span>
          <Input
            id={i === 0 ? id : undefined}
            aria-label={`${label} ${i + 1}`}
            value={item}
            maxLength={maxLength}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('remove')}
            disabled={disabled || items.length <= Math.max(min, 1)}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      {items.length < max ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...items, ''])}
        >
          <Plus className="size-4" aria-hidden />
          {t('add')}
        </Button>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

function PhotoInput({
  id,
  label,
  optional,
  error,
  ids,
  urls,
  max,
  brandId,
  disabled,
  onAdd,
  onRemove,
}: {
  id: string
  label: string
  optional: boolean
  error?: string
  ids: string[]
  urls: Record<string, string>
  max: number
  brandId: string
  disabled: boolean
  onAdd: (id: string, url: string) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('templates.ui')
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const input = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const busy = disabled || uploading
  const full = ids.length >= max

  const upload = async (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) return setUploadError(new Error(t('photoHint')))
    setUploading(true)
    try {
      const asset = await uploadMediaFile(file, { brandId })
      onAdd(asset.id, asset.url)
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${id}-error` : hintId}>
      <legend className="text-sm font-medium">
        {label}
        {optional ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">({t('optional')})</span>
        ) : null}
      </legend>
      {ids.length ? (
        <ul className="flex flex-wrap gap-2">
          {ids.map((photoId, i) => (
            <li key={photoId} className="relative size-24 overflow-hidden rounded-lg border bg-muted">
              {urls[photoId] ? (
                // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
                <img src={urls[photoId]} alt={`${label} ${i + 1}`} className="size-full object-cover" />
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(i)}
                aria-label={t('removePhoto')}
                className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-background/90 shadow"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!full ? (
        <div className="flex flex-wrap gap-2">
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setOpen(true)}
            aria-invalid={Boolean(error)}
          >
            <Images className="size-4" aria-hidden />
            {t('fromGallery')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            {uploading ? t('uploading') : t('upload')}
          </Button>
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      ) : null}
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('photoHint')}
      </p>
      <ErrorBox error={uploadError} />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <GalleryPhotoPicker
        open={open}
        onOpenChange={setOpen}
        brandId={brandId}
        value={null}
        onPick={(photo) => {
          onAdd(photo.id, photo.url)
          setOpen(false)
        }}
      />
    </fieldset>
  )
}
