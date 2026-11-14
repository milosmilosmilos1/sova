import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { BrandContentClient } from '@/components/brand/brand-content-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brandContent')
  return { title: t('title') }
}

/**
 * Brend i nalog, kartica Vrste objava (D-165): utisci klijenata, tim, pre i posle, interaktivne objave i
 * humor. Podatke unosi biznis; Sova od njih pravi objave i ništa ne izmišlja.
 */
export default async function BrandContentPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand/content')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <div className="space-y-6">
      <BrandAccountHeader />
      <BrandContentClient key={brand.id} brandId={brand.id} />
    </div>
  )
}
