'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { VoiceForm, type VoiceViewData } from '@/components/brand/voice-form'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import type { BrandVoice } from '@/lib/schemas/voice'

import { StepFooter } from './step-footer'

/** Korak 4: glas brenda i glavne teme; predlog iz analize sajta dok vlasnik ne sačuva svoj. */
export function StepBrand({
  brandId,
  canEdit,
  emailVerified,
  onBack,
  onNext,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
  onBack: () => void
  onNext: () => void
}) {
  const t = useTranslations('setup.brand')
  const query = useQuery({
    queryKey: ['brand-voice', brandId],
    queryFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`),
    refetchOnMount: 'always',
  })
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
      </div>
      {query.data && query.isFetchedAfterMount ? (
        <BrandEditor
          key={brandId}
          brandId={brandId}
          canEdit={canEdit}
          emailVerified={emailVerified}
          view={query.data}
          onBack={onBack}
          onNext={onNext}
        />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      )}
    </div>
  )
}

function BrandEditor({
  brandId,
  canEdit,
  emailVerified,
  view,
  onBack,
  onNext,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
  view: VoiceViewData
  onBack: () => void
  onNext: () => void
}) {
  const t = useTranslations('setup')
  const tv = useTranslations('voice')
  const qc = useQueryClient()
  const [value, setValue] = useState<BrandVoice>(view.voice)
  const save = useMutation({
    mutationFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`, { method: 'PUT', json: value }),
    onSuccess: (data) => {
      qc.setQueryData(['brand-voice', brandId], data)
      onNext()
    },
  })
  return (
    <div className="space-y-6">
      {view.fromProfile && !view.saved ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {tv('fromProfile')}
        </p>
      ) : null}
      <VoiceForm
        brandId={brandId}
        value={value}
        onChange={setValue}
        disabled={!canEdit || save.isPending}
        view={view}
        emailVerified={emailVerified}
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
