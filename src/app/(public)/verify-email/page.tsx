import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ResendVerificationForm } from '@/components/auth/simple-forms'
import { isDev } from '@/lib/env'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth.verify')])
  return publicMetadata({ locale, path: '/verify-email', title: t('metaTitle') })
}

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const [params, t] = await Promise.all([searchParams, getTranslations('auth.verify')])
  const email = typeof params.email === 'string' ? params.email : undefined
  return (
    <AuthCard title={t('title')} description={t('description')}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{t('notArrived')}</p>
        {isDev ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t.rich('dev', {
              link: (chunks) => (
                <a className="underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : null}
        <ResendVerificationForm email={email} />
      </div>
    </AuthCard>
  )
}
