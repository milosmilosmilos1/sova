import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { StudioClient } from '@/components/studio/studio-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'AI Studio' }

export default async function StudioPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/studio')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return <StudioClient workspaceId={current.workspaceId} brandId={brand.id} brandName={brand.name} />
}
