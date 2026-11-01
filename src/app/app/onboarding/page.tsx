import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { OnboardingForm } from '@/components/app/onboarding-form'
import { getViewer } from '@/lib/auth/viewer'
import { listMemberships } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding')
  return { title: t('metaTitle') }
}

export default async function OnboardingPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/onboarding')
  const memberships = await listMemberships(viewer)
  const first = memberships.length === 0
  const t = await getTranslations('onboarding')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{first ? t('titleFirst') : t('titleNew')}</h1>
        <p className="text-sm text-muted-foreground">{first ? t('textFirst') : t('textNew')}</p>
      </div>
      <OnboardingForm
        defaultName={first && viewer.profile.fullName ? `${viewer.profile.fullName}` : undefined}
      />
    </div>
  )
}
