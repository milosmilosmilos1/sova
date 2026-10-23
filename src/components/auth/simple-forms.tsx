'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { forgotPasswordAction, resendVerificationAction, resetPasswordAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {state.code !== 'check_email' ? (
        <>
          <TextField name="email" label="Email" type="email" state={state} required autoComplete="email" />
          <SubmitButton pendingText="Šaljem…" className="w-full">
            Pošaljite link za promenu lozinke
          </SubmitButton>
        </>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Nazad na prijavu
        </Link>
      </p>
    </form>
  )
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {state.code === 'expired' ? (
        <p className="text-sm">
          <Link href="/forgot-password" className="underline">
            Zatražite nov link
          </Link>
        </p>
      ) : (
        <>
          <TextField
            name="password"
            label="Nova lozinka"
            type="password"
            state={state}
            required
            autoComplete="new-password"
            minLength={10}
            hint="Najmanje 10 karaktera."
          />
          <TextField
            name="confirmPassword"
            label="Ponovite lozinku"
            type="password"
            state={state}
            required
            autoComplete="new-password"
          />
          <SubmitButton pendingText="Čuvam…" className="w-full">
            Sačuvajte novu lozinku
          </SubmitButton>
        </>
      )}
    </form>
  )
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState(resendVerificationAction, {
    ...initialFormState,
    values: email ? { email } : undefined,
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Email"
        type="email"
        state={state}
        required
        autoComplete="email"
        defaultValue={email}
      />
      <SubmitButton pendingText="Šaljem…" variant="outline" className="w-full">
        Pošaljite ponovo email za potvrdu
      </SubmitButton>
    </form>
  )
}
