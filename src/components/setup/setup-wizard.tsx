'use client'

import { useMutation } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ContentLocale } from '@/config/locales'
import { SETUP_STEPS } from '@/lib/schemas/setup'
import { cn } from '@/lib/utils'

import { StepAnalysis } from './step-analysis'
import { StepBrand } from './step-brand'
import { StepColors, StepStyle } from './step-design'
import { StepDone } from './step-done'
import { StepNetworks } from './step-networks'
import { StepWelcome } from './step-welcome'

/**
 * Uvod u sedam koraka (D-112): jezik, mreže, analiza sajta i PDF-a, glas brenda i teme, boje, stil i
 * teme koje postaju tokovi. Svaki korak čuva svoje; korak je u adresi, pa povratak sa mreže (OAuth)
 * i osvežavanje strane ostaju na istom mestu.
 */
export function SetupWizard({
  brandId,
  brandName,
  websiteUrl,
  contentLocale,
  canEdit,
  canAdmin,
  emailVerified,
  showUiLocale,
  initialStep,
  pendingState,
  notice,
  completedAt,
}: {
  brandId: string
  brandName: string
  websiteUrl: string | null
  contentLocale: ContentLocale
  canEdit: boolean
  canAdmin: boolean
  emailVerified: boolean
  showUiLocale: boolean
  initialStep: number
  pendingState: string | null
  notice: string | null
  completedAt: string | null
}) {
  const t = useTranslations('setup')
  const format = useFormatter()
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const strip = useRef<HTMLOListElement>(null)
  const total = SETUP_STEPS.length
  const name = SETUP_STEPS[step - 1]!

  const go = (n: number) => {
    const next = Math.min(total, Math.max(1, n))
    setStep(next)
    window.history.replaceState(null, '', `/app/setup?step=${next}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // na telefonu je traka koraka vodoravna: aktivni korak se pomera u vidno polje
  useEffect(() => {
    const ol = strip.current
    const current = ol?.querySelector<HTMLElement>('[aria-current="step"]')
    if (ol && current && ol.scrollWidth > ol.clientWidth)
      ol.scrollTo({ left: current.offsetLeft - ol.offsetLeft - 8, behavior: 'smooth' })
  }, [step])

  const back = () => go(step - 1)
  const next = () => go(step + 1)

  const skip = useMutation({
    mutationFn: () => api(`/api/brands/${brandId}/setup`, { method: 'POST', json: { skip: true } }),
    onSuccess: () => {
      router.push('/app')
      router.refresh()
    },
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">
            {t('stepOf', { n: step, total })} · {t(`steps.${name}`)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title', { brand: brandName })}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {!completedAt && canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={skip.isPending}
            onClick={() => {
              if (window.confirm(t('skipConfirm'))) skip.mutate()
            }}
          >
            {t('skipAll')}
          </Button>
        ) : null}
      </div>
      <ErrorBox error={skip.error} />
      {completedAt ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('completed', { date: format.dateTime(new Date(completedAt), { dateStyle: 'medium' }) })}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('viewOnly')}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label={t('stepsLabel')}>
          <ol
            ref={strip}
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
          >
            {SETUP_STEPS.map((s, i) => {
              const n = i + 1
              return (
                <li key={s} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(n)}
                    aria-current={step === n ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                      step === n ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold',
                        step > n
                          ? 'bg-primary/15 text-primary'
                          : step === n
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted',
                      )}
                    >
                      {step > n ? <Check className="size-4" aria-hidden /> : n}
                    </span>
                    <span className="min-w-0 pr-1">
                      <span className="block text-sm font-medium whitespace-nowrap">{t(`steps.${s}`)}</span>
                      <span className="hidden truncate text-xs text-muted-foreground lg:block">
                        {t(`steps.${s}Hint`)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <Card>
          <CardContent className="pt-6">
            {name === 'welcome' ? (
              <StepWelcome
                brandId={brandId}
                contentLocale={contentLocale}
                showUiLocale={showUiLocale}
                canEdit={canEdit}
                onNext={next}
              />
            ) : name === 'networks' ? (
              <StepNetworks
                brandId={brandId}
                canAdmin={canAdmin}
                pendingState={pendingState}
                notice={notice}
                onBack={back}
                onNext={next}
              />
            ) : name === 'analysis' ? (
              <StepAnalysis
                brandId={brandId}
                websiteUrl={websiteUrl}
                canEdit={canEdit}
                emailVerified={emailVerified}
                onBack={back}
                onNext={next}
              />
            ) : name === 'brand' ? (
              <StepBrand
                brandId={brandId}
                canEdit={canEdit}
                emailVerified={emailVerified}
                onBack={back}
                onNext={next}
              />
            ) : name === 'colors' ? (
              <StepColors brandId={brandId} canEdit={canEdit} onBack={back} onNext={next} />
            ) : name === 'style' ? (
              <StepStyle brandId={brandId} canEdit={canEdit} onBack={back} onNext={next} />
            ) : (
              <StepDone brandId={brandId} canEdit={canEdit} contentLocale={contentLocale} onBack={back} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
