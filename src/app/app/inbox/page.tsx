import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { InboxShell } from '@/components/inbox/inbox-shell'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { INBOX_FLAG, isFeatureEnabledFor } from '@/lib/flags'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inbox')
  return { title: t('metaTitle') }
}

/** Inbox (D-117): poruke, komentari, recenzije i predlozi sadržaja. */
export default async function InboxPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/inbox')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  return (
    <InboxShell
      brandId={brand.id}
      brandName={brand.name}
      canEdit={EDIT_ROLES.includes(current.role)}
      enabled={await isFeatureEnabledFor(INBOX_FLAG, current.workspaceId)}
    />
  )
}
