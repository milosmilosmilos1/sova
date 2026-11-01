'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { localePath } from '@/i18n/paths'
import { googleSignInAction, magicLinkAction, signInAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

export function LoginForm({
  next,
  googleEnabled,
  initialError,
}: {
  next?: string
  googleEnabled: boolean
  initialError?: string
}) {
  const t = useTranslations('auth')
  const locale = useLocale()
  // linkovi ka javnim stranama nose jezik strane (D-130)
  const href = (path: string) => localePath(locale, path) as Route
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [passwordState, passwordAction] = useActionState(signInAction, initialFormState)
  const [magicState, magicAction] = useActionState(magicLinkAction, initialFormState)

  return (
    <div className="space-y-6">
      {initialError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {initialError}
        </div>
      ) : null}

      {googleEnabled ? (
        <form action={googleSignInAction}>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Button type="submit" variant="outline" className="w-full">
            {t('google')}
          </Button>
        </form>
      ) : null}

      {googleEnabled ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" /> {t('or')} <Separator className="flex-1" />
        </div>
      ) : null}

      {mode === 'password' ? (
        <form action={passwordAction} className="space-y-4" noValidate>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <FormMessage state={passwordState} />
          <TextField
            name="email"
            label={t('email')}
            type="email"
            state={passwordState}
            required
            autoComplete="email"
          />
          <TextField
            name="password"
            label={t('password')}
            type="password"
            state={passwordState}
            required
            autoComplete="current-password"
          />
          {passwordState.code === 'unverified' && passwordState.values?.email ? (
            <p className="text-sm">
              <Link
                className="underline"
                href={href(`/verify-email?email=${encodeURIComponent(passwordState.values.email)}`)}
              >
                {t('resendVerification')}
              </Link>
            </p>
          ) : null}
          <SubmitButton pendingText={t('login.pending')} className="w-full">
            {t('login.submit')}
          </SubmitButton>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode('magic')}
            >
              {t('login.magic')}
            </button>
            <Link
              href={href('/forgot-password')}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('login.forgot')}
            </Link>
          </div>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4" noValidate>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <FormMessage state={magicState} />
          {magicState.code !== 'check_email' ? (
            <>
              <TextField
                name="email"
                label={t('email')}
                type="email"
                state={magicState}
                required
                autoComplete="email"
              />
              <SubmitButton pendingText={t('login.magicPending')} className="w-full">
                {t('login.magicSubmit')}
              </SubmitButton>
            </>
          ) : null}
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMode('password')}
          >
            {t('login.backToPassword')}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link
          href={href(next ? `/register?next=${encodeURIComponent(next)}` : '/register')}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('login.createOne')}
        </Link>
      </p>
    </div>
  )
}
