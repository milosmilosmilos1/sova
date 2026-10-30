'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BrandVoice } from '@/lib/schemas/voice'

import { DocumentsPanel } from './documents-panel'
import { VoiceForm, type VoiceViewData } from './voice-form'

/** Glas brenda i dokumenti o brendu na strani Brend (D-112). */
export function VoiceCard({
  brandId,
  canEdit,
  emailVerified,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
}) {
  const t = useTranslations('voice')
  const td = useTranslations('documents')
  const query = useQuery({
    queryKey: ['brand-voice', brandId],
    queryFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`),
  })
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {query.data ? (
            // obrazac se puni podacima pri prikazu; drugi brend dobija novi obrazac (key), bez efekta
            <VoiceEditor
              key={brandId}
              brandId={brandId}
              canEdit={canEdit}
              emailVerified={emailVerified}
              view={query.data}
            />
          ) : query.error ? (
            <ErrorBox error={query.error} />
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{td('title')}</CardTitle>
          <CardDescription>{td('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentsPanel brandId={brandId} canEdit={canEdit} emailVerified={emailVerified} />
        </CardContent>
      </Card>
    </div>
  )
}

function VoiceEditor({
  brandId,
  canEdit,
  emailVerified,
  view,
}: {
  brandId: string
  canEdit: boolean
  emailVerified: boolean
  view: VoiceViewData
}) {
  const t = useTranslations('voice')
  const format = useFormatter()
  const qc = useQueryClient()
  const [value, setValue] = useState<BrandVoice>(view.voice)
  const [savedNow, setSavedNow] = useState(false)
  const save = useMutation({
    mutationFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`, { method: 'PUT', json: value }),
    onSuccess: (data) => {
      qc.setQueryData(['brand-voice', brandId], data)
      setValue(data.voice)
      setSavedNow(true)
    },
  })
  // posle čuvanja `view` stiže iz keša upita (setQueryData), a obrazac zadržava svoje stanje
  const current = view
  return (
    <div className="space-y-5">
      {current.fromProfile && !current.saved ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {t('fromProfile')}
        </p>
      ) : null}
      <VoiceForm
        brandId={brandId}
        value={value}
        onChange={(next) => {
          setValue(next)
          setSavedNow(false)
        }}
        disabled={!canEdit || save.isPending}
        view={current}
        emailVerified={emailVerified}
      />
      <ErrorBox error={save.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canEdit || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('saving') : t('save')}
        </Button>
        {savedNow ? (
          <span role="status" className="text-sm text-muted-foreground">
            {t('saved')}
          </span>
        ) : current.saved && current.updatedAt ? (
          <span className="text-sm text-muted-foreground">
            {t('savedAt', { date: format.dateTime(new Date(current.updatedAt), { dateStyle: 'medium' }) })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
