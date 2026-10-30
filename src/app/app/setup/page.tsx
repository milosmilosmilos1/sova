import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { SetupWizard } from '@/components/setup/setup-wizard'
import { toContentLocale } from '@/config/locales'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { isFeatureEnabled } from '@/lib/flags'
import { SETUP_STEPS } from '@/lib/schemas/setup'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('setup')
  return { title: t('metaTitle') }
}

/** Uvod u sedam koraka (D-112) za trenutni brend; povratak sa mreže otvara korak Mreže. */
export default async function SetupPage({ searchParams }: PageProps<'/app/setup'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/setup')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const sp = await searchParams
  const pending = typeof sp.pending === 'string' ? sp.pending : null
  const notice = typeof sp.connect === 'string' ? sp.connect : null
  const asked = Number(sp.step)
  const initialStep =
    pending || notice ? 2 : Number.isInteger(asked) && asked >= 1 && asked <= SETUP_STEPS.length ? asked : 1

  return (
    <SetupWizard
      brandId={brand.id}
      brandName={brand.name}
      websiteUrl={brand.website_url}
      contentLocale={toContentLocale(brand.content_locale)}
      canEdit={EDIT_ROLES.includes(current.role)}
      canAdmin={ADMIN_ROLES.includes(current.role)}
      emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      showUiLocale={await isFeatureEnabled('ui_languages')}
      initialStep={initialStep}
      pendingState={pending}
      notice={notice}
      completedAt={brand.setup_completed_at}
    />
  )
}
