'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, type ReactNode } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadMediaFile } from '@/lib/media/client-upload'
import {
  PHOTO_SOURCES,
  POST_SIZES,
  SLIDES_MAX,
  SLIDES_MIN,
  type PhotoSource,
  type PostSize,
  type StyleId,
} from '@/lib/visuals/design/catalog'
import type { DesignColors } from '@/lib/visuals/design/types'
import { cn } from '@/lib/utils'

import { ColorsEditor } from './colors-editor'
import { LookPicker, type LookChoice } from './look-picker'
import { previewUrl, StylePicker } from './style-picker'

export interface DesignView {
  styleId: StyleId
  size: PostSize
  photoSource: PhotoSource
  slides: number
  colors: DesignColors
  handle: string | null
  logoAssetId: string | null
  logoSource: 'custom' | 'site' | null
  saved: { colors: boolean; handle: boolean }
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function useDesign(brandId: string) {
  return useQuery({
    queryKey: ['design', brandId],
    queryFn: () => api<DesignView>(`/api/brands/${brandId}/design`),
  })
}

function useSaveDesign(brandId: string, onSaved?: (data: DesignView) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<DesignView>(`/api/brands/${brandId}/design`, { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      qc.setQueryData(['design', brandId], data)
      onSaved?.(data)
    },
  })
}

function DesignShell({
  title,
  description,
  query,
  className,
  children,
}: {
  title: string
  description: string
  query: ReturnType<typeof useDesign>
  className?: string
  children: (data: DesignView) => ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.data ? (
          children(query.data)
        ) : query.error ? (
          <ErrorBox error={query.error} />
        ) : (
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        )}
      </CardContent>
    </Card>
  )
}

function SlidePreviews({ brandId, draft }: { brandId: string; draft: DesignView }) {
  const t = useTranslations('design')
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{t('preview.label')}</h3>
      <div className="grid grid-cols-3 gap-2">
        {(['cover', 'point', 'cta'] as const).map((kind) => (
          <figure key={kind} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- dinamički pregled sa API-ja */}
            <img
              src={previewUrl({
                brandId,
                styleId: draft.styleId,
                format: draft.size,
                kind,
                colors: draft.colors,
                photo: draft.photoSource !== 'none',
                v: draft.logoAssetId,
              })}
              alt={`${t(`styles.${draft.styleId}.name`)}: ${t(`preview.${kind}`)}`}
              className={cn(
                'w-full rounded-lg border object-cover',
                draft.size === 'square' ? 'aspect-square' : 'aspect-[4/5]',
              )}
            />
            <figcaption className="text-center text-xs text-muted-foreground">
              {t(`preview.${kind}`)}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-sm font-medium">{t(`styles.${draft.styleId}.name`)}</p>
      <p className="text-xs text-muted-foreground">{t(`styles.${draft.styleId}.desc`)}</p>
    </section>
  )
}

/**
 * Vizuelni identitet (D-108, D-113): boje, logo, fotografije, format, broj slajdova i nalog na
 * slajdovima, sa pregledom uživo naslovnog slajda, slajda sadržaja i poziva na akciju.
 */
export function DesignVisualCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('design')
  const query = useDesign(brandId)
  return (
    <DesignShell title={t('visual.title')} description={t('visual.description')} query={query}>
      {/* obrazac se puni podacima pri prikazu; drugi brend ili izabran izgled (D-123) daje novi obrazac */}
      {(data) => (
        <VisualEditor
          key={`${brandId}:${JSON.stringify([data.colors, data.styleId])}`}
          brandId={brandId}
          canEdit={canEdit}
          initial={data}
        />
      )}
    </DesignShell>
  )
}

function VisualEditor({
  brandId,
  canEdit,
  initial,
}: {
  brandId: string
  canEdit: boolean
  initial: DesignView
}) {
  const t = useTranslations('design')
  const [draft, setDraft] = useState<DesignView>(initial)
  const [savedAt, setSavedAt] = useState(0)
  const save = useSaveDesign(brandId, (data) => {
    setDraft(data)
    setSavedAt(Date.now())
  })
  const logo = useSaveDesign(brandId, (data) =>
    setDraft((cur) => ({ ...cur, logoAssetId: data.logoAssetId, logoSource: data.logoSource })),
  )
  const disabled = !canEdit || save.isPending
  const set = <K extends keyof DesignView>(key: K, value: DesignView[K]) =>
    setDraft({ ...draft, [key]: value })
  const option = (active: boolean) =>
    cn(
      'flex-1 rounded-lg border p-3 text-left text-sm transition-colors',
      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
    )

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{t('colors.label')}</h3>
              <span className="text-xs text-muted-foreground">
                {draft.saved.colors ? t('colors.custom') : t('colors.fromProfile')}
              </span>
            </div>
            <ColorsEditor value={draft.colors} onChange={(c) => set('colors', c)} disabled={disabled} />
          </section>

          <LogoSection
            brandId={brandId}
            source={draft.logoSource}
            disabled={!canEdit || logo.isPending}
            onPick={(assetId) => logo.mutate({ logoAssetId: assetId })}
            pending={logo.isPending}
            error={logo.error}
          />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('photoSource.label')}</h3>
            <div
              className="flex flex-col gap-2 sm:flex-row"
              role="radiogroup"
              aria-label={t('photoSource.label')}
            >
              {PHOTO_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={draft.photoSource === s}
                  disabled={disabled}
                  className={option(draft.photoSource === s)}
                  onClick={() => set('photoSource', s)}
                >
                  <span className="block font-medium">{t(`photoSource.${s}`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`photoSource.${s}Hint`)}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="design-size">{t('size.label')}</Label>
              <select
                id="design-size"
                value={draft.size}
                disabled={disabled}
                onChange={(e) => set('size', e.target.value as PostSize)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {POST_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {t(`size.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="design-slides">{t('slides.label')}</Label>
              <Input
                id="design-slides"
                type="number"
                min={SLIDES_MIN}
                max={SLIDES_MAX}
                value={draft.slides}
                disabled={disabled}
                onChange={(e) =>
                  set(
                    'slides',
                    Math.min(SLIDES_MAX, Math.max(SLIDES_MIN, Number(e.target.value) || SLIDES_MIN)),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                {t('slides.hint', { min: SLIDES_MIN, max: SLIDES_MAX })}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="design-handle">{t('handle.label')}</Label>
            <Input
              id="design-handle"
              value={draft.handle ?? ''}
              placeholder={t('handle.placeholder')}
              disabled={disabled}
              maxLength={40}
              onChange={(e) => set('handle', e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground">{t('handle.hint')}</p>
          </div>
        </div>

        <SlidePreviews brandId={brandId} draft={draft} />
      </div>

      <ErrorBox error={save.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled}
          onClick={() =>
            save.mutate({
              size: draft.size,
              photoSource: draft.photoSource,
              slides: draft.slides,
              colors: draft.colors,
              handle: draft.handle,
            })
          }
        >
          {save.isPending ? t('saving') : t('save')}
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => save.mutate({ reset: true })}>
          {t('reset')}
        </Button>
        {savedAt && !save.isPending && !save.error ? (
          <span role="status" className="text-sm text-muted-foreground">
            {t('saved')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function LogoSection({
  brandId,
  source,
  disabled,
  pending,
  error,
  onPick,
}: {
  brandId: string
  source: DesignView['logoSource']
  disabled: boolean
  pending: boolean
  error: unknown
  onPick: (assetId: string | null) => void
}) {
  const t = useTranslations('design.logo')
  const input = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const [uploading, setUploading] = useState(false)
  const busy = disabled || uploading || pending

  const pick = async (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) return setUploadError(new Error(t('notImage')))
    setUploading(true)
    try {
      const asset = await uploadMediaFile(file, { brandId })
      onPick(asset.id)
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t('label')}</h3>
        <span className="text-xs text-muted-foreground">
          {source === 'custom' ? t('custom') : source === 'site' ? t('fromSite') : t('none')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImageUp className="size-4" aria-hidden />
          {uploading || pending ? t('uploading') : t('upload')}
        </Button>
        {source === 'custom' ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onPick(null)}>
            {t('remove')}
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <ErrorBox error={uploadError ?? error} />
    </section>
  )
}

/** Stilovi objava (D-108): 22 stila sa pregledom; izbor važi za Studio i tokove. */
export function DesignStylesCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('design')
  const query = useDesign(brandId)
  return (
    <DesignShell
      title={t('stylesCard.title')}
      description={t('stylesCard.description')}
      query={query}
      // pregled sa dugmetom je sticky, a Card podrazumevano seče sadržaj
      className="overflow-visible"
    >
      {(data) => <StylesEditor key={brandId} brandId={brandId} canEdit={canEdit} initial={data} />}
    </DesignShell>
  )
}

function StylesEditor({
  brandId,
  canEdit,
  initial,
}: {
  brandId: string
  canEdit: boolean
  initial: DesignView
}) {
  const t = useTranslations('design')
  const [styleId, setStyleId] = useState<StyleId>(initial.styleId)
  const [savedAt, setSavedAt] = useState(0)
  const save = useSaveDesign(brandId, () => setSavedAt(Date.now()))
  const disabled = !canEdit || save.isPending
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      {/* pregled i čuvanje ostaju vidljivi dok se lista stilova skroluje */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <SlidePreviews brandId={brandId} draft={{ ...initial, styleId }} />
        <ErrorBox error={save.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={disabled || styleId === initial.styleId} onClick={() => save.mutate({ styleId })}>
            {save.isPending ? t('saving') : t('stylesCard.save')}
          </Button>
          {savedAt && !save.isPending && !save.error ? (
            <span role="status" className="text-sm text-muted-foreground">
              {t('saved')}
            </span>
          ) : null}
        </div>
      </div>
      <StylePicker
        brandId={brandId}
        value={styleId}
        onChange={(id) => {
          setStyleId(id)
          setSavedAt(0)
        }}
        size={initial.size}
        colors={initial.colors}
        photo={initial.photoSource !== 'none'}
        disabled={disabled}
      />
    </div>
  )
}

/**
 * Izgled objava (D-123): tri predloga sa sajta i sopstveni izgled; izbor menja stil, boje i font
 * brenda odjednom, pa važi za plan, Studio i tokove.
 */
export function DesignLookCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('design.looks')
  const td = useTranslations('design')
  const qc = useQueryClient()
  const [choice, setChoice] = useState<LookChoice | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const save = useSaveDesign(brandId, () => {
    setSavedAt(Date.now())
    setChoice(null)
    void qc.invalidateQueries({ queryKey: ['looks', brandId] })
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LookPicker
          brandId={brandId}
          canEdit={canEdit}
          onChoice={(next) => {
            setChoice(next)
            setSavedAt(0)
          }}
        />
        <ErrorBox error={save.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!canEdit || !choice || save.isPending}
            onClick={() => choice && save.mutate({ ...choice })}
          >
            {save.isPending ? td('saving') : t('save')}
          </Button>
          {savedAt && !save.isPending && !save.error ? (
            <span role="status" className="text-sm text-muted-foreground">
              {t('saved')}
            </span>
          ) : !choice && canEdit ? (
            <span className="text-sm text-muted-foreground">{t('pick')}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
