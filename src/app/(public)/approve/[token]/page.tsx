import type { Metadata } from 'next'

import { PublicApprovalClient } from '@/components/posts/public-approval-client'

export const metadata: Metadata = { title: 'Odobravanje objava', robots: { index: false, follow: false } }

/** Javna strana za klijenta bez naloga: objave sa linka, odluka i komentar. */
export default async function ApprovePage({ params }: PageProps<'/approve/[token]'>) {
  const { token } = await params
  return <PublicApprovalClient token={token} />
}
