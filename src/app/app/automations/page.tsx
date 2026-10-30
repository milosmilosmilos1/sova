import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { DmAutomations } from '@/components/inbox/dm-automations'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('automations')
  return { title: t('metaTitle') }
}

/** DM automatizacija (D-117). */
export default async function AutomationsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/automations')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return <DmAutomations brandId={brand.id} canEdit={EDIT_ROLES.includes(current.role)} />
}
