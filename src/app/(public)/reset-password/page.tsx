import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ResetPasswordForm } from '@/components/auth/simple-forms'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth.reset')])
  return publicMetadata({ locale, path: '/reset-password', title: t('title') })
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth.reset')
  return (
    <AuthCard title={t('title')} description={t('description')}>
      <ResetPasswordForm />
    </AuthCard>
  )
}
