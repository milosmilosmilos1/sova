import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CalendarClient } from '@/components/posts/calendar-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Kalendar' }

export default async function CalendarPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/calendar')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return <CalendarClient brandId={brand.id} brandName={brand.name} timezone={brand.timezone} />
}
