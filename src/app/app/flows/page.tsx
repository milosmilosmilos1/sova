import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { FlowsClient } from '@/components/flows/flows-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { SLIDES_DEFAULT } from '@/lib/visuals/design/catalog'
import { getBrand } from '@/services/brands'
import { storedDesign } from '@/services/design/brand-design'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('flows'))('title') }
}

export default async function FlowsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/flows')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const summary = await getCurrentBrand(viewer, current.workspaceId)
  if (!summary) redirect('/app/settings')
  const brand = await getBrand(viewer, summary.id)
  return (
    <FlowsClient
      brandId={brand.id}
      timeZone={brand.timezone}
      canEdit={EDIT_ROLES.includes(current.role)}
      // broj slajdova je iz sačuvanog dizajna, kao u resolveDesign, bez čitanja profila i naloga (D-164)
      defaultSlides={storedDesign(brand).slides ?? SLIDES_DEFAULT}
    />
  )
}
