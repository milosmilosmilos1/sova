import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { GalleryClient } from '@/components/gallery/gallery-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gallery')
  return { title: t('metaTitle') }
}

/** Galerija brenda (D-114). */
export default async function GalleryPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/gallery')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <GalleryClient
      brandId={brand.id}
      canEdit={EDIT_ROLES.includes(current.role)}
      emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
    />
  )
}
