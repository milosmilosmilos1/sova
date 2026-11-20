'use client'

import { Check } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import type { ContentLocale } from '@/config/locales'
import { stepReady } from '@/lib/brand/readiness'
import { SETUP_STEPS } from '@/lib/schemas/setup'
import { cn } from '@/lib/utils'

import { useSetupState } from './readiness'

import { StepAnalysis } from './step-analysis'
import { StepBrand } from './step-brand'
import { StepColors, StepStyle } from './step-design'
import { StepDone } from './step-done'
import { StepNetworks } from './step-networks'
import { StepWelcome } from './step-welcome'

/**
 * Uvod u sedam koraka (D-112): jezik, mreže, analiza sajta i PDF-a, glas brenda i teme, logo i boje,
 * stil i teme koje postaju tokovi. Svaki korak čuva svoje; korak je u adresi, pa povratak sa mreže
 * (OAuth) i osvežavanje strane ostaju na istom mestu. Uvod se ne preskače (D-174): kvačica stoji uz
 * korak tek kad je urađen, a dok brend nije kompletan, strane sa objavama vode ovde.
 */
export function SetupWizard({
  brandId,
  brandName,
  websiteUrl,
  contentLocale,
  canEdit,
  canAdmin,
  emailVerified,
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
  initialStep: number
  pendingState: string | null
  notice: string | null
  completedAt: string | null
}) {
  const t = useTranslations('setup')
  const format = useFormatter()
  const [step, setStep] = useState(initialStep)
  const state = useSetupState(brandId)
  const readiness = state.data?.readiness
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
      </div>
      {completedAt ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('completed', { date: format.dateTime(new Date(completedAt), { dateStyle: 'medium' }) })}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {readiness && !readiness.complete ? t('viewOnlyLocked') : t('viewOnly')}
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
              // korak sa uslovom (analiza, brend, izgled, stil) dobija kvačicu tek kad je urađen,
              // jezik i mreže kad su prođeni, a poslednji korak nikad
              const conditional = s !== 'welcome' && s !== 'networks' && s !== 'done'
              const checked =
                s === 'done' ? false : conditional && readiness ? stepReady(readiness, s) : step > n
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
                        step === n
                          ? 'bg-primary text-primary-foreground'
                          : checked
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted',
                      )}
                    >
                      {checked && step !== n ? <Check className="size-4" aria-hidden /> : n}
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
              <StepWelcome brandId={brandId} contentLocale={contentLocale} canEdit={canEdit} onNext={next} />
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
              <StepDone
                brandId={brandId}
                canEdit={canEdit}
                contentLocale={contentLocale}
                onBack={back}
                onGo={go}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
