'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
            Nastavite sa Google nalogom
          </Button>
        </form>
      ) : null}

      {googleEnabled ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" /> ili <Separator className="flex-1" />
        </div>
      ) : null}

      {mode === 'password' ? (
        <form action={passwordAction} className="space-y-4" noValidate>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <FormMessage state={passwordState} />
          <TextField
            name="email"
            label="Email"
            type="email"
            state={passwordState}
            required
            autoComplete="email"
          />
          <TextField
            name="password"
            label="Lozinka"
            type="password"
            state={passwordState}
            required
            autoComplete="current-password"
          />
          {passwordState.code === 'unverified' && passwordState.values?.email ? (
            <p className="text-sm">
              <Link
                className="underline"
                href={`/verify-email?email=${encodeURIComponent(passwordState.values.email)}`}
              >
                Pošaljite ponovo email za potvrdu
              </Link>
            </p>
          ) : null}
          <SubmitButton pendingText="Prijavljujem…" className="w-full">
            Prijavite se
          </SubmitButton>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode('magic')}
            >
              Prijava linkom na email
            </button>
            <Link
              href="/forgot-password"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Zaboravili ste lozinku?
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
                label="Email"
                type="email"
                state={magicState}
                required
                autoComplete="email"
              />
              <SubmitButton pendingText="Šaljem link…" className="w-full">
                Pošaljite mi link za prijavu
              </SubmitButton>
            </>
          ) : null}
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMode('password')}
          >
            Nazad na prijavu lozinkom
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Nemate nalog?{' '}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Napravite ga
        </Link>
      </p>
    </div>
  )
}
