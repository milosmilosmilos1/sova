import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { RegisterForm } from '@/components/auth/register-form'
import { configured } from '@/lib/env'
import { nextPathSchema } from '@/lib/schemas/auth'
import { publicMetadata } from '@/lib/seo'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth.register')])
  return publicMetadata({ locale, path: '/register', title: t('metaTitle') })
}

async function registrationOpen(): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'registration_open')
    .maybeSingle()
  return data?.enabled ?? true
}

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const params = await searchParams
  const next = nextPathSchema.parse(typeof params.next === 'string' ? params.next : undefined)
  const [open, t] = await Promise.all([registrationOpen(), getTranslations('auth.register')])
  return (
    <AuthCard title={t('title')} description={t('description')}>
      {open ? (
        <RegisterForm next={next} googleEnabled={configured.google} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('closed')}</p>
      )}
    </AuthCard>
  )
}
