import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { AnalyticsClient } from '@/components/analytics/analytics-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('analytics')
  return { title: t('metaTitle') }
}

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
      reportEmails={brand.report_emails}
      canManageRecipients={ADMIN_ROLES.includes(current.role)}
    />
  )
}
