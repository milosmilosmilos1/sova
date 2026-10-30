'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { CONTENT_LOCALES, type ContentLocale } from '@/config/locales'
import { changeLocaleAction } from '@/i18n/actions'
import { locales } from '@/i18n/config'
import { cn } from '@/lib/utils'

import { StepFooter } from './step-footer'

export const optionClass = (selected: boolean) =>
  cn(
    'rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
  )

/** Korak 1: jezik aplikacije (iza flaga dok svi ekrani nisu prevedeni) i jezik objava brenda. */
export function StepWelcome({
  brandId,
  contentLocale,
  showUiLocale,
  canEdit,
  onNext,
}: {
  brandId: string
  contentLocale: ContentLocale
  showUiLocale: boolean
  canEdit: boolean
  onNext: () => void
}) {
  const t = useTranslations('setup.welcome')
  const tl = useTranslations('locale')
  const tc = useTranslations('contentLocale')
  const uiLocale = useLocale()
  const router = useRouter()
  const [uiPending, startUi] = useTransition()
  const [content, setContent] = useState<ContentLocale>(contentLocale)
  const save = useMutation({
    mutationFn: () => api(`/api/brands/${brandId}`, { method: 'PATCH', json: { contentLocale: content } }),
    onSuccess: () => {
      router.refresh()
      onNext()
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
      </div>

      {showUiLocale ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{tl('label')}</legend>
          <p className="text-xs text-muted-foreground">{t('uiLocaleHint')}</p>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={tl('label')}>
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={uiLocale === l}
                disabled={uiPending}
                className={optionClass(uiLocale === l)}
                onClick={() =>
                  startUi(async () => {
                    await changeLocaleAction(l)
                    router.refresh()
                  })
                }
              >
                <span className="font-medium">{tl(l)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tc('label')}</legend>
        <p className="text-xs text-muted-foreground">{t('contentLocaleHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tc('label')}>
          {CONTENT_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={content === l}
              disabled={!canEdit || save.isPending}
              className={optionClass(content === l)}
              onClick={() => setContent(l)}
            >
              <span className="font-medium">{tc(l)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <ErrorBox error={save.error} />
      <StepFooter
        pending={save.isPending}
        onNext={() => (canEdit && content !== contentLocale ? save.mutate() : onNext())}
      />
    </div>
  )
}
