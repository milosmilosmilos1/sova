'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { DesignView } from '@/components/design/design-card'
import { LookPicker, type LookChoice } from '@/components/design/look-picker'
import { StylePicker } from '@/components/design/style-picker'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Label } from '@/components/ui/label'
import { PHOTO_SOURCES, POST_SIZES, type PostSize } from '@/lib/visuals/design/catalog'

import { StepFooter } from './step-footer'
import { optionClass } from './step-welcome'

type StepProps = { brandId: string; canEdit: boolean; onBack: () => void; onNext: () => void }

/** Dizajn brenda za korake 5 i 6; čita se ponovo pri prikazu, jer ga analiza sajta menja. */
function useDesign(brandId: string) {
  return useQuery({
    queryKey: ['design', brandId],
    queryFn: () => api<DesignView>(`/api/brands/${brandId}/design`),
    refetchOnMount: 'always',
  })
}

function Loading({ error }: { error: unknown }) {
  return error ? <ErrorBox error={error} /> : <div className="h-80 animate-pulse rounded-lg bg-muted" />
}

/**
 * Korak 5: izgled objava (D-123). Sova je sajt upravo analizirala, pa odmah predlaže tri izgleda od
 * njegovih boja i fontova; četvrti korisnik sastavlja od tri boje i fonta.
 */
export function StepColors({ brandId, canEdit, onBack, onNext }: StepProps) {
  const t = useTranslations('setup')
  const qc = useQueryClient()
  const [choice, setChoice] = useState<LookChoice | null>(null)
  const save = useMutation({
    mutationFn: (body: LookChoice) =>
      api<DesignView>(`/api/brands/${brandId}/design`, { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      qc.setQueryData(['design', brandId], data)
      onNext()
    },
  })
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('colors.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('colors.text')}</p>
      </div>
      <LookPicker brandId={brandId} canEdit={canEdit} onChoice={setChoice} />
      <ErrorBox error={save.error} />
      <StepFooter
        onBack={onBack}
        onSkip={onNext}
        onNext={() => (canEdit && choice ? save.mutate(choice) : onNext())}
        nextLabel={canEdit && choice ? t('saveNext') : undefined}
        pending={save.isPending}
      />
    </div>
  )
}

/** Korak 6: stil objava, izvor fotografija i format. */
export function StepStyle(props: StepProps) {
  const t = useTranslations('setup.style')
  const query = useDesign(props.brandId)
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
      </div>
      {query.data && query.isFetchedAfterMount ? (
        <StyleForm key={props.brandId} {...props} initial={query.data} />
      ) : (
        <Loading error={query.error} />
      )}
    </div>
  )
}

function StyleForm({ brandId, canEdit, onBack, onNext, initial }: StepProps & { initial: DesignView }) {
  const t = useTranslations('setup')
  const td = useTranslations('design')
  const qc = useQueryClient()
  const [styleId, setStyleId] = useState(initial.styleId)
  const [photoSource, setPhotoSource] = useState(initial.photoSource)
  const [size, setSize] = useState<PostSize>(initial.size)
  const disabled = !canEdit
  const save = useMutation({
    mutationFn: () =>
      api<DesignView>(`/api/brands/${brandId}/design`, {
        method: 'PATCH',
        json: { styleId, photoSource, size },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['design', brandId], data)
      onNext()
    },
  })
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{td('photoSource.label')}</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={td('photoSource.label')}>
            {PHOTO_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={photoSource === s}
                disabled={disabled || save.isPending}
                className={optionClass(photoSource === s)}
                onClick={() => setPhotoSource(s)}
              >
                <span className="block font-medium">{td(`photoSource.${s}`)}</span>
                <span className="block text-xs text-muted-foreground">{td(`photoSource.${s}Hint`)}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="setup-size">{td('size.label')}</Label>
          <select
            id="setup-size"
            value={size}
            disabled={disabled || save.isPending}
            onChange={(e) => setSize(e.target.value as PostSize)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {POST_SIZES.map((s) => (
              <option key={s} value={s}>
                {td(`size.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <StylePicker
        brandId={brandId}
        value={styleId}
        onChange={setStyleId}
        size={size}
        colors={initial.colors}
        photo={photoSource !== 'none'}
        disabled={disabled || save.isPending}
      />
      <ErrorBox error={save.error} />
      <StepFooter
        onBack={onBack}
        onSkip={onNext}
        onNext={() => (canEdit ? save.mutate() : onNext())}
        nextLabel={canEdit ? t('saveNext') : undefined}
        pending={save.isPending}
      />
    </div>
  )
}
