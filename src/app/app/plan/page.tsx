import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { MonthPlan } from '@/components/plans/month-plan'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plan')
  return { title: t('metaTitle') }
}

/** Mesečni plan (D-119): ceo mesec objava na jedan klik. */
export default async function PlanPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/plan')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return <MonthPlan brandId={brand.id} canEdit={EDIT_ROLES.includes(current.role)} />
}
