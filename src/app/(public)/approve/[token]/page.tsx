import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PublicApprovalClient } from '@/components/posts/public-approval-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('publicApproval')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/** Javna strana za klijenta bez naloga: objave sa linka, odluka i komentar. */
export default async function ApprovePage({ params }: PageProps<'/approve/[token]'>) {
  const { token } = await params
  return <PublicApprovalClient token={token} />
}
