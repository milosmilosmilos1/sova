import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AccountsClient } from '@/components/accounts/accounts-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Mreže' }

export default async function AccountsPage({ searchParams }: PageProps<'/app/accounts'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/accounts')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const sp = await searchParams
  return (
    <AccountsClient
      brandId={typeof sp.brand === 'string' ? sp.brand : brand.id}
      brandName={brand.name}
      canAdmin={ADMIN_ROLES.includes(current.role)}
      canEdit={EDIT_ROLES.includes(current.role)}
      pendingState={typeof sp.pending === 'string' ? sp.pending : null}
      notice={typeof sp.connect === 'string' ? sp.connect : null}
      noticeProvider={typeof sp.provider === 'string' ? sp.provider : null}
    />
  )
}
