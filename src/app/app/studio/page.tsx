import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { StudioChat } from '@/components/studio/studio-chat'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('studio')
  return { title: t('metaTitle') }
}

/** Studio kao razgovor (D-116); ručni alati su na /app/studio/tools. */
export default async function StudioPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/studio')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <StudioChat
      workspaceId={current.workspaceId}
      brandId={brand.id}
      canEdit={EDIT_ROLES.includes(current.role)}
      emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
    />
  )
}
