import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AnalyticsClient } from '@/components/analytics/analytics-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Analitika' }

export default async function AnalyticsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/analytics')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <AnalyticsClient
      brandId={brand.id}
      brandName={brand.name}
      timezone={brand.timezone}
      canEdit={EDIT_ROLES.includes(current.role)}
    />
  )
}
