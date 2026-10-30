'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

/** Dno koraka uvoda: nazad, preskoči i glavna radnja (dalje ili sačuvaj i dalje). */
export function StepFooter({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  pending = false,
  nextDisabled = false,
}: {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  pending?: boolean
  nextDisabled?: boolean
}) {
  const t = useTranslations('setup')
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            ← {t('back')}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {onSkip ? (
          <Button type="button" variant="outline" onClick={onSkip} disabled={pending}>
            {t('skipStep')}
          </Button>
        ) : null}
        <Button type="button" onClick={onNext} disabled={pending || nextDisabled}>
          {nextLabel ?? t('next')}
        </Button>
      </div>
    </div>
  )
}
