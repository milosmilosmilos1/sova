import type { Metadata } from 'next'

import { AuthCard } from '@/components/auth/auth-card'
import { ResendVerificationForm } from '@/components/auth/simple-forms'
import { isDev } from '@/lib/env'

export const metadata: Metadata = { title: 'Potvrdite email' }

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const params = await searchParams
  const email = typeof params.email === 'string' ? params.email : undefined
  return (
    <AuthCard
      title="Proverite poštu"
      description="Poslali smo vam link za potvrdu email adrese. Kliknite na njega da aktivirate nalog."
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Nije stiglo? Proverite spam folder ili zatražite novu poruku. Link važi 24 sata.
        </p>
        {isDev ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            DEV: lokalni emailovi stižu u Mailpit na{' '}
            <a className="underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
              127.0.0.1:54324
            </a>
            .
          </p>
        ) : null}
        <ResendVerificationForm email={email} />
      </div>
    </AuthCard>
  )
}
