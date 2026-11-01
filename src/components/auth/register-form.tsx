'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { FieldErrors, FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { localePath } from '@/i18n/paths'
import { googleSignInAction, signUpAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

export function RegisterForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  // linkovi ka javnim stranama nose jezik strane (D-130)
  const href = (path: string) => localePath(locale, path) as Route
  const [state, action] = useActionState(signUpAction, initialFormState)

  return (
    <div className="space-y-6">
      {googleEnabled ? (
        <>
          <form action={googleSignInAction}>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <Button type="submit" variant="outline" className="w-full">
              {t('google')}
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> {t('or')} <Separator className="flex-1" />
          </div>
        </>
      ) : null}

      <form action={action} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <FormMessage state={state} />
        <TextField
          name="fullName"
          label={t('register.fullName')}
          state={state}
          required
          autoComplete="name"
          maxLength={100}
        />
        <TextField name="email" label={t('email')} type="email" state={state} required autoComplete="email" />
        <TextField
          name="password"
          label={t('password')}
          type="password"
          state={state}
          required
          autoComplete="new-password"
          minLength={10}
          hint={t('passwordHint')}
        />
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              value="on"
              required
              aria-describedby="acceptTerms-error"
              className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
            />
            <Label htmlFor="acceptTerms" className="text-sm leading-5 font-normal">
              {t.rich('register.terms', {
                terms: (chunks) => (
                  <Link href={href('/terms')} className="underline" target="_blank">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href={href('/privacy')} className="underline" target="_blank">
                    {chunks}
                  </Link>
                ),
              })}
            </Label>
          </div>
          <FieldErrors errors={state.fields?.acceptTerms} id="acceptTerms-error" />
        </div>
        <TurnstileWidget />
        <SubmitButton pendingText={t('register.pending')} className="w-full">
          {t('register.submit')}
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link
          href={href(next ? `/login?next=${encodeURIComponent(next)}` : '/login')}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('register.login')}
        </Link>
      </p>
    </div>
  )
}
