'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import { createWorkspaceAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'
import { cn } from '@/lib/utils'

const TYPES = ['business', 'agency'] as const

export function OnboardingForm({ defaultName }: { defaultName?: string }) {
  const t = useTranslations('onboarding')
  const [state, action] = useActionState(createWorkspaceAction, initialFormState)
  const [type, setType] = useState<'business' | 'agency'>(
    (state.values?.type as 'business' | 'agency') ?? 'business',
  )

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('typeLegend')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((value) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-lg border p-4 hover:bg-muted/50',
                type === value && 'border-primary ring-2 ring-primary/30',
              )}
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="sr-only"
              />
              <span className="block font-medium">{t(`types.${value}.title`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`types.${value}.text`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        name="name"
        label={type === 'agency' ? t('agencyName') : t('companyName')}
        state={state}
        required
        defaultValue={defaultName}
        maxLength={100}
      />
      {type === 'agency' ? (
        <TextField
          name="brandName"
          label={t('firstClient')}
          state={state}
          hint={t('firstClientHint')}
          maxLength={100}
        />
      ) : (
        <input type="hidden" name="brandName" value="" />
      )}
      <div className="space-y-1.5">
        <TextField
          name="websiteUrl"
          label={t('website')}
          state={state}
          placeholder={t('websitePlaceholder')}
          hint={t('websiteHint')}
          autoComplete="url"
        />
        <Label className="sr-only" htmlFor="websiteUrl">
          {t('websiteShort')}
        </Label>
      </div>
      <SubmitButton pendingText={t('pending')} className="w-full sm:w-auto">
        {t('submit')}
      </SubmitButton>
    </form>
  )
}
