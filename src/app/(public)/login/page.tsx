import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { SignedOutBroadcast } from '@/components/app/auth-sync'
import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/login-form'
import { configured } from '@/lib/env'
import { nextPathSchema } from '@/lib/schemas/auth'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth.login')])
  return publicMetadata({ locale, path: '/login', title: t('title') })
}

/** Greške iz adrese (`?error=`); nepoznata greška se prikazuje kao nevažeći link. */
const ERRORS = ['link', 'provider', 'google'] as const
type LoginError = (typeof ERRORS)[number]
const isLoginError = (value: string): value is LoginError => (ERRORS as readonly string[]).includes(value)

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const [params, t] = await Promise.all([searchParams, getTranslations('auth.login')])
  const next = nextPathSchema.parse(typeof params.next === 'string' ? params.next : undefined)
  const errorKey = typeof params.error === 'string' ? params.error : undefined
  const deleted = params.nalog === 'obrisan'
  const signedOut = params.odjava === '1' || deleted
  return (
    <AuthCard title={t('title')} description={t('description')}>
      {signedOut ? <SignedOutBroadcast /> : null}
      {deleted ? (
        <p role="status" className="mb-4 rounded-md border px-3 py-2 text-sm">
          {t('deleted')}
        </p>
      ) : null}
      <LoginForm
        next={next}
        googleEnabled={configured.google}
        initialError={errorKey ? t(`errors.${isLoginError(errorKey) ? errorKey : 'link'}`) : undefined}
      />
    </AuthCard>
  )
}
