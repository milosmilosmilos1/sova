import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { CalendarClient } from '@/components/posts/calendar-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { requireCompleteBrand } from '@/lib/auth/brand-ready'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calendar')
  return { title: t('metaTitle') }
}

export default async function CalendarPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/calendar')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  await requireCompleteBrand(brand.id)
  // otkazuju vlasnik, administrator i urednik (isto pravilo kao za radnju „cancel” na serveru)
  return (
    <CalendarClient
      brandId={brand.id}
      timezone={brand.timezone}
      canCancel={EDIT_ROLES.includes(current.role)}
    />
  )
}
