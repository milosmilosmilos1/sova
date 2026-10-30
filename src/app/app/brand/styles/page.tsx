import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { DesignStylesCard } from '@/components/design/design-card'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brandAccount.tabs')
  return { title: t('styles') }
}

/** Brend i nalog, kartica Stilovi (D-113): stil objava sa pregledom. */
export default async function BrandStylesPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand/styles')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <div className="space-y-6">
      <BrandAccountHeader />
      <DesignStylesCard brandId={brand.id} canEdit={EDIT_ROLES.includes(current.role)} />
    </div>
  )
}
