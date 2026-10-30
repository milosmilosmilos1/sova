import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrainClient } from '@/components/brain/brain-client'
import { BrandBrainClient } from '@/components/brand/brand-brain-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brain')
  return { title: t('metaTitle') }
}

/** Brain (D-113): šta Sova zna, odakle uči i playbook; ispod analiza sajta i ceo profil (sidro #sajt). */
export default async function BrainPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brain')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const canEdit = EDIT_ROLES.includes(current.role)
  const emailVerified = Boolean(viewer.profile.emailVerifiedAt)
  return (
    <div className="space-y-10">
      <BrainClient brandId={brand.id} canEdit={canEdit} emailVerified={emailVerified} />
      <section id="sajt" className="scroll-mt-6">
        <BrandBrainClient
          brandId={brand.id}
          brandName={brand.name}
          websiteUrl={brand.website_url}
          canEdit={canEdit}
          emailVerified={emailVerified}
        />
      </section>
    </div>
  )
}
