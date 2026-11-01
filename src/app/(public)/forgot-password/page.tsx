import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/simple-forms'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth.forgot')])
  return publicMetadata({ locale, path: '/forgot-password', title: t('title') })
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot')
  return (
    <AuthCard title={t('title')} description={t('description')}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}
