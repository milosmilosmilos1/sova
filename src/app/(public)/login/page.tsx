import type { Metadata } from 'next'

import { SignedOutBroadcast } from '@/components/app/auth-sync'
import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/login-form'
import { configured } from '@/lib/env'
import { nextPathSchema } from '@/lib/schemas/auth'

export const metadata: Metadata = { title: 'Prijava' }

const ERRORS: Record<string, string> = {
  link: 'Link je nevažeći ili je istekao. Prijavite se ili zatražite nov link.',
  provider: 'Prijava preko spoljnog naloga nije uspela. Pokušajte ponovo.',
  google: 'Google prijava trenutno nije dostupna.',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = nextPathSchema.parse(typeof params.next === 'string' ? params.next : undefined)
  const errorKey = typeof params.error === 'string' ? params.error : undefined
  const deleted = params.nalog === 'obrisan'
  const signedOut = params.odjava === '1' || deleted
  return (
    <AuthCard title="Prijava" description="Dobro došli nazad u Sovu.">
      {signedOut ? <SignedOutBroadcast /> : null}
      {deleted ? (
        <p role="status" className="mb-4 rounded-md border px-3 py-2 text-sm">
          Nalog je obrisan zajedno sa vašim podacima. Hvala što ste koristili Sovu.
        </p>
      ) : null}
      <LoginForm
        next={next}
        googleEnabled={configured.google}
        initialError={errorKey ? (ERRORS[errorKey] ?? ERRORS.link) : undefined}
      />
    </AuthCard>
  )
}
