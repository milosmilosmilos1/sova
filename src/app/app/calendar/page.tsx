import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { CalendarClient } from '@/components/posts/calendar-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

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
  return <CalendarClient brandId={brand.id} timezone={brand.timezone} />
}
