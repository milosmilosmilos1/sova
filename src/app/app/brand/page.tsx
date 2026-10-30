import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BrandBrainClient } from '@/components/brand/brand-brain-client'
import { VoiceCard } from '@/components/brand/voice-card'
import { DesignCard } from '@/components/design/design-card'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Brand Brain' }

export default async function BrandPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const canEdit = EDIT_ROLES.includes(current.role)
  return (
    <div className="space-y-6">
      <VoiceCard
        brandId={brand.id}
        canEdit={canEdit}
        emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      />
      <DesignCard brandId={brand.id} canEdit={canEdit} />
      <BrandBrainClient
        brandId={brand.id}
        brandName={brand.name}
        websiteUrl={brand.website_url}
        canEdit={canEdit}
        emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      />
    </div>
  )
}
