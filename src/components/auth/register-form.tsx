'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { FieldErrors, FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { googleSignInAction, signUpAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

export function RegisterForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const [state, action] = useActionState(signUpAction, initialFormState)

  return (
    <div className="space-y-6">
      {googleEnabled ? (
        <>
          <form action={googleSignInAction}>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <Button type="submit" variant="outline" className="w-full">
              Nastavite sa Google nalogom
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> ili <Separator className="flex-1" />
          </div>
        </>
      ) : null}

      <form action={action} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <FormMessage state={state} />
        <TextField
          name="fullName"
          label="Ime i prezime"
          state={state}
          required
          autoComplete="name"
          maxLength={100}
        />
        <TextField name="email" label="Email" type="email" state={state} required autoComplete="email" />
        <TextField
          name="password"
          label="Lozinka"
          type="password"
          state={state}
          required
          autoComplete="new-password"
          minLength={10}
          hint="Najmanje 10 karaktera."
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
              Prihvatam{' '}
              <Link href="/terms" className="underline" target="_blank">
                Uslove korišćenja
              </Link>{' '}
              i{' '}
              <Link href="/privacy" className="underline" target="_blank">
                Politiku privatnosti
              </Link>
              .
            </Label>
          </div>
          <FieldErrors errors={state.fields?.acceptTerms} id="acceptTerms-error" />
        </div>
        <TurnstileWidget />
        <SubmitButton pendingText="Pravim nalog…" className="w-full">
          Napravite nalog
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Već imate nalog?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Prijavite se
        </Link>
      </p>
    </div>
  )
}
