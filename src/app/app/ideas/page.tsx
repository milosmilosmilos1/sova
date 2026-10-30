import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { IdeasClient } from '@/components/ideas/ideas-client'
import { company } from '@/config/company'
import { getViewer } from '@/lib/auth/viewer'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ideas')
  return { title: t('metaTitle') }
}

/** Tabla predloga i prijava problema (D-115); `?new=idea|bug` otvara formu. */
export default async function IdeasPage({ searchParams }: PageProps<'/app/ideas'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/ideas')
  const sp = await searchParams
  const open = sp.new === 'bug' ? 'bug' : sp.new === 'idea' ? 'idea' : null
  return (
    <IdeasClient
      supportEmail={company.supportEmail}
      isAdmin={viewer.profile.platformRole === 'platform_admin' && !viewer.impersonation}
      openForm={open}
    />
  )
}
