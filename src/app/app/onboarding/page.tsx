import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { OnboardingForm } from '@/components/app/onboarding-form'
import { getViewer } from '@/lib/auth/viewer'
import { listMemberships } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Početak' }

export default async function OnboardingPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/onboarding')
  const memberships = await listMemberships(viewer)
  const first = memberships.length === 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{first ? 'Krenimo' : 'Nov radni prostor'}</h1>
        <p className="text-sm text-muted-foreground">
          {first
            ? 'Prvo radni prostor i prvi brend. Analiza sajta, povezivanje mreža i strategija dolaze odmah posle.'
            : 'Svaki radni prostor ima svoj tim, brendove i tokene.'}
        </p>
      </div>
      <OnboardingForm
        defaultName={first && viewer.profile.fullName ? `${viewer.profile.fullName}` : undefined}
      />
    </div>
  )
}
