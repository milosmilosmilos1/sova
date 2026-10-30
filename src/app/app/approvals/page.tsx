import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ReviewDesk } from '@/components/review/review-desk'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'
import { getTokenPrice } from '@/lib/tokens/prices'
import { getBrand } from '@/services/brands'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('review'))('title') }
}

export default async function ApprovalsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/approvals')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const summary = await getCurrentBrand(viewer, current.workspaceId)
  if (!summary) redirect('/app/settings')
  const brand = await getBrand(viewer, summary.id)
  return <ReviewDesk brandId={brand.id} timeZone={brand.timezone} textPrice={await getTokenPrice('text')} />
}
