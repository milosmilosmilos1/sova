import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { AutopilotClient } from '@/components/autopilot/autopilot-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { requireCompleteBrand } from '@/lib/auth/brand-ready'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('autopilot')
  return { title: t('metaTitle') }
}

export default async function AutopilotPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/autopilot')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  await requireCompleteBrand(brand.id)
  return (
    <AutopilotClient
      brandId={brand.id}
      canAdmin={ADMIN_ROLES.includes(current.role)}
      canEdit={EDIT_ROLES.includes(current.role)}
    />
  )
}
