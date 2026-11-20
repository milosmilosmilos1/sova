'use client'

import { useQuery } from '@tanstack/react-query'
import { Check, Circle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { api } from '@/components/shared/api-client'
import {
  MIN_TOPICS,
  READINESS_ITEMS,
  READINESS_STEP,
  type Readiness,
  type ReadinessItem,
} from '@/lib/brand/readiness'
import { SETUP_STEPS, type SetupStep } from '@/lib/schemas/setup'
import { cn } from '@/lib/utils'

/** Stanje uvoda sa servera (D-112), sa spiskom šta brendu fali do prve objave (D-174). */
export interface SetupState {
  completedAt: string | null
  accounts: number
  crawled: boolean
  documents: number
  voiceSaved: boolean
  flows: number
  readiness: Readiness
}

/**
 * Stanje uvoda; `poll` ga čita ponovo na nekoliko sekundi dok stavke koraka ne budu gotove (analiza
 * sajta i čitanje PDF-a završavaju se u pozadini).
 */
export function useSetupState(brandId: string, poll?: SetupStep) {
  return useQuery({
    queryKey: ['setup-state', brandId],
    queryFn: () => api<SetupState>(`/api/brands/${brandId}/setup`),
    refetchOnMount: 'always',
    refetchInterval: (q) => {
      const r = q.state.data?.readiness
      if (!poll || !r) return false
      return READINESS_ITEMS.some((i) => READINESS_STEP[i] === poll && !r.items[i]) ? 4000 : false
    },
  })
}

/** Poruka ispod koraka: šta tačno fali da bi se išlo dalje. */
export function ReadinessHint({ readiness, step }: { readiness: Readiness | undefined; step: SetupStep }) {
  const t = useTranslations('setup.readiness')
  const tv = useTranslations('voice.fields')
  if (!readiness) return null
  const lines: string[] = []
  for (const item of READINESS_ITEMS) {
    if (READINESS_STEP[item] !== step || readiness.items[item]) continue
    if (item === 'brain') lines.push(t('needBrain'))
    if (item === 'voice')
      lines.push(t('needVoice', { fields: readiness.missingVoice.map((f) => tv(f)).join(', ') }))
    if (item === 'topics') lines.push(t('needTopics', { count: MIN_TOPICS - readiness.topics }))
    if (item === 'logo') lines.push(t('needLogo'))
    if (item === 'colors') lines.push(t('needColors'))
  }
  if (!lines.length) return null
  return (
    <div
      role="status"
      className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

/** Spisak za poslednji korak: svaka stavka sa kvačicom ili dugmetom do koraka gde se rešava. */
export function ReadinessList({ readiness, onGo }: { readiness: Readiness; onGo: (step: number) => void }) {
  const t = useTranslations('setup.readiness')
  return (
    <section className="space-y-2 rounded-lg border p-4" aria-labelledby="readiness-title">
      <h3 id="readiness-title" className="font-medium">
        {readiness.complete ? t('done') : t('title')}
      </h3>
      {!readiness.complete ? <p className="text-sm text-muted-foreground">{t('text')}</p> : null}
      <ul className="divide-y">
        {READINESS_ITEMS.map((item: ReadinessItem) => {
          const ok = readiness.items[item]
          return (
            <li key={item} className="flex items-center gap-2 py-1.5 text-sm">
              {ok ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className={cn('min-w-0 flex-1', !ok && 'font-medium')}>{t(`items.${item}`)}</span>
              {!ok ? (
                <button
                  type="button"
                  onClick={() => onGo(SETUP_STEPS.indexOf(READINESS_STEP[item]) + 1)}
                  className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  aria-label={`${t('goTo')}: ${t(`items.${item}`)}`}
                >
                  {t('goTo')}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
