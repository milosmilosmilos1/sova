'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { previewUrl, StylePicker } from './style-picker'

export interface DesignView {
  styleId: StyleId
  size: PostSize
  photoSource: PhotoSource
  slides: number
  colors: DesignColors
  handle: string | null
  saved: { colors: boolean; handle: boolean }
}

/**
 * Dizajn objava brenda (D-108): boje, stil, format, fotografije, broj slajdova i nalog na slajdovima,
 * sa pregledom uživo naslovnog slajda, slajda sadržaja i poziva na akciju.
 */
export function DesignCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('design')
  const query = useQuery({
    queryKey: ['design', brandId],
    queryFn: () => api<DesignView>(`/api/brands/${brandId}/design`),
  })
  if (!query.data)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.error ? (
            <ErrorBox error={query.error} />
          ) : (
            <div className="h-48 animate-pulse rounded-lg bg-muted" />
          )}
        </CardContent>
      </Card>
    )
  // obrazac se puni podacima pri prikazu; drugi brend dobija novi obrazac (key), bez efekta
  return <DesignEditor key={brandId} brandId={brandId} canEdit={canEdit} initial={query.data} />
}

function DesignEditor({
  brandId,
  canEdit,
  initial,
}: {
  brandId: string
  canEdit: boolean
  initial: DesignView
}) {
  const t = useTranslations('design')
  const qc = useQueryClient()
  const [draft, setDraft] = useState<DesignView>(initial)
  const [savedAt, setSavedAt] = useState(0)
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<DesignView>(`/api/brands/${brandId}/design`, { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      qc.setQueryData(['design', brandId], data)
      setDraft(data)
      setSavedAt(Date.now())
    },
  })

  const disabled = !canEdit || save.isPending
  const set = <K extends keyof DesignView>(key: K, value: DesignView[K]) =>
    setDraft({ ...draft, [key]: value })
  const option = (active: boolean) =>
    cn(
      'flex-1 rounded-lg border p-3 text-left text-sm transition-colors',
      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
        </div>

        <StylePicker
          brandId={brandId}
          value={draft.styleId}
          onChange={(id) => set('styleId', id)}
          size={draft.size}
          colors={draft.colors}
          photo={draft.photoSource !== 'none'}
          disabled={disabled}
        />

        <ErrorBox error={save.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={disabled}
            onClick={() =>
              save.mutate({
                styleId: draft.styleId,
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
      </CardContent>
    </Card>
  )
}
