import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { InboxClient } from '@/components/autopilot/inbox-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Inbox predloga' }

export default async function InboxPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/inbox')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return <InboxClient brandId={brand.id} brandName={brand.name} canEdit={EDIT_ROLES.includes(current.role)} />
}
