'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { localePath } from '@/i18n/paths'
import { forgotPasswordAction, resendVerificationAction, resetPasswordAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

export function ForgotPasswordForm() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const [state, action] = useActionState(forgotPasswordAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {state.code !== 'check_email' ? (
        <>
          <TextField
            name="email"
            label={t('email')}
            type="email"
            state={state}
            required
            autoComplete="email"
          />
          <SubmitButton pendingText={t('sending')} className="w-full">
            {t('forgot.submit')}
          </SubmitButton>
        </>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">
        <Link href={localePath(locale, '/login') as Route} className="underline-offset-4 hover:underline">
          {t('forgot.back')}
        </Link>
      </p>
    </form>
  )
}

export function ResetPasswordForm() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const [state, action] = useActionState(resetPasswordAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {state.code === 'expired' ? (
        <p className="text-sm">
          <Link href={localePath(locale, '/forgot-password') as Route} className="underline">
            {t('reset.requestNew')}
          </Link>
        </p>
      ) : (
        <>
          <TextField
            name="password"
            label={t('reset.newPassword')}
            type="password"
            state={state}
            required
            autoComplete="new-password"
            minLength={10}
            hint={t('passwordHint')}
          />
          <TextField
            name="confirmPassword"
            label={t('reset.confirm')}
            type="password"
            state={state}
            required
            autoComplete="new-password"
          />
          <SubmitButton pendingText={t('reset.pending')} className="w-full">
            {t('reset.submit')}
          </SubmitButton>
        </>
      )}
    </form>
  )
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const t = useTranslations('auth')
  const [state, action] = useActionState(resendVerificationAction, {
    ...initialFormState,
    values: email ? { email } : undefined,
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        label={t('email')}
        type="email"
        state={state}
        required
        autoComplete="email"
        defaultValue={email}
      />
      <SubmitButton pendingText={t('sending')} variant="outline" className="w-full">
        {t('resendVerification')}
      </SubmitButton>
    </form>
  )
}
