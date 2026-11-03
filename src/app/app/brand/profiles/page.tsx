import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { HighlightsCard } from '@/components/brand/profile-highlights'
import { ProfileKitCard } from '@/components/brand/profile-kit'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'
import { getProfileKit } from '@/services/brand-brain/profile-kit'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brandAccount.tabs')
  return { title: t('profiles') }
}

/**
 * Brend i nalog, kartica Profili mreža: opisi profila za svaku mrežu (D-143) i Instagram highlights
 * (D-144), oba iz profila brenda.
 */
export default async function BrandProfilesPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand/profiles')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const kit = await getProfileKit(viewer, brand.id)
  return (
    <div className="space-y-6">
      <BrandAccountHeader />
      <ProfileKitCard
        brandId={brand.id}
        initial={kit}
        emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      />
      <HighlightsCard
        brandId={brand.id}
        initial={kit}
        emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      />
    </div>
  )
}
