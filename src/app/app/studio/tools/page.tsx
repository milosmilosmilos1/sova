import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { StudioClient } from '@/components/studio/studio-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'
import { configured } from '@/lib/env'
import { AI_IMAGES_FLAG, isFeatureEnabled } from '@/lib/flags'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell')
  return { title: t('titles.studioTools') }
}

/** Ručni alati Studija (forma „Nova objava”, Unsplash, Pexels, Canva, šablon); razgovor je na /app/studio (D-116). */
export default async function StudioToolsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/studio/tools')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <StudioClient
      workspaceId={current.workspaceId}
      brandId={brand.id}
      brandName={brand.name}
      brandLocale={brand.content_locale}
      sources={{ unsplash: configured.unsplash, pexels: configured.pexels }}
      aiImages={await isFeatureEnabled(AI_IMAGES_FLAG)}
    />
  )
}
