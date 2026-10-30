'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { VoiceViewData } from '@/components/brand/voice-form'
import type { DesignView } from '@/components/design/design-card'
import { dayKey } from '@/components/flows/flows-client'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { ContentLocale } from '@/config/locales'
import { setupFlowDays } from '@/lib/schemas/setup'

interface SetupState {
  completedAt: string | null
  accounts: number
  crawled: boolean
  documents: number
  voiceSaved: boolean
  flows: number
}

/** Prve dve teme se uključuju same; ostale čekaju pauzirane dok ih vlasnik ne uključi. */
const ACTIVE_BY_DEFAULT = 2

/**
 * Korak 7: pregled podešenog i teme koje postaju tokovi. Tek „Završi” pravi tokove i označava uvod
 * kao završen; tokovi bez povezane mreže nastaju pauzirani.
 */
export function StepDone({
  brandId,
  canEdit,
  contentLocale,
  onBack,
}: {
  brandId: string
  canEdit: boolean
  contentLocale: ContentLocale
  onBack: () => void
}) {
  const t = useTranslations('setup.done')
  const ts = useTranslations('setup')
  const tc = useTranslations('contentLocale')
  const td = useTranslations('design')
  const tf = useTranslations('flows')
  const router = useRouter()
  const voice = useQuery({
    queryKey: ['brand-voice', brandId],
    queryFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`),
    refetchOnMount: 'always',
  })
  const state = useQuery({
    queryKey: ['setup-state', brandId],
    queryFn: () => api<SetupState>(`/api/brands/${brandId}/setup`),
    refetchOnMount: 'always',
  })
  const design = useQuery({
    queryKey: ['design', brandId],
    queryFn: () => api<DesignView>(`/api/brands/${brandId}/design`),
  })
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const topics = voice.data?.voice.topics ?? []
  const noAccounts = state.data ? state.data.accounts === 0 : false
  const isOn = (topic: string, i: number) => !noAccounts && (toggled[topic] ?? i < ACTIVE_BY_DEFAULT)
  const active = topics.filter((x, i) => isOn(x, i)).length

  const finish = useMutation({
    mutationFn: (withFlows: boolean) =>
      api<{ flows: unknown[] }>(`/api/brands/${brandId}/setup`, {
        method: 'POST',
        json: { flows: withFlows ? topics.map((topic, i) => ({ topic, active: isOn(topic, i) })) : [] },
      }),
    onSuccess: (r) => {
      router.push(r.flows.length ? '/app/flows' : '/app')
      router.refresh()
    },
  })

  const summary: Array<[string, string]> = [
    [t('summary.language'), tc(contentLocale)],
    [t('summary.accounts'), String(state.data?.accounts ?? '…')],
    [
      t('summary.site'),
      state.data ? (state.data.crawled ? t('summary.siteDone') : t('summary.siteNone')) : '…',
    ],
    [t('summary.documents'), String(state.data?.documents ?? '…')],
    [t('summary.style'), design.data ? td(`styles.${design.data.styleId}.name`) : '…'],
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
      </div>

      <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {summary.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 sm:block">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <ErrorBox error={voice.error ?? state.error} />
      {noAccounts ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {t('noAccounts')}
        </p>
      ) : null}

      {topics.length ? (
        <ul className="divide-y rounded-lg border">
          {topics.map((topic, i) => {
            const days = setupFlowDays(i)
              .map((d) => tf(dayKey(d)))
              .join(', ')
            return (
              <li key={topic} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic}</p>
                  <p className="text-xs text-muted-foreground">{t('schedule', { days })}</p>
                </div>
                <Switch
                  checked={isOn(topic, i)}
                  disabled={!canEdit || noAccounts || finish.isPending}
                  onCheckedChange={(on) => setToggled((cur) => ({ ...cur, [topic]: on }))}
                  aria-label={t('toggle', { topic })}
                />
              </li>
            )
          })}
        </ul>
      ) : voice.isSuccess ? (
        <p className="text-sm text-muted-foreground">{t('noTopics')}</p>
      ) : null}

      {topics.length && voice.data ? (
        <p className="text-sm text-muted-foreground">
          {t('cost', { price: voice.data.draftPrice, active, perWeek: active * 2 })}
        </p>
      ) : null}

      <ErrorBox error={finish.error} />
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={finish.isPending}>
          ← {ts('back')}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {topics.length ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || finish.isPending}
              onClick={() => finish.mutate(false)}
            >
              {t('finishNoFlows')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canEdit || finish.isPending || !voice.isSuccess}
            onClick={() => finish.mutate(topics.length > 0)}
          >
            {finish.isPending ? t('finishing') : topics.length ? t('finish') : t('finishNoFlows')}
          </Button>
        </div>
      </div>
    </div>
  )
}
