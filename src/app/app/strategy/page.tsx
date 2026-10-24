import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { StrategyClient } from '@/components/strategy/strategy-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Strategija' }

export default async function StrategyPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/strategy')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <StrategyClient
      brandId={brand.id}
      brandName={brand.name}
      timezone={brand.timezone}
      canEdit={EDIT_ROLES.includes(current.role)}
    />
  )
}
