import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { DesignLookCard, DesignVisualCard } from '@/components/design/design-card'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brandAccount.tabs')
  return { title: t('visual') }
}

/**
 * Brend i nalog, kartica Vizuelni identitet (D-113): izgled objava sa tri predloga sa sajta i
 * sopstvenim izgledom (D-123), pa pojedinačne boje, logo, fotografije i format.
 */
export default async function BrandVisualPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand/visual')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <div className="space-y-6">
      <BrandAccountHeader />
      <DesignLookCard brandId={brand.id} canEdit={EDIT_ROLES.includes(current.role)} />
      <DesignVisualCard brandId={brand.id} canEdit={EDIT_ROLES.includes(current.role)} />
    </div>
  )
}
