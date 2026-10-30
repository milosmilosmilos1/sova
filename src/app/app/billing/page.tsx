import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { BillingPanel } from '@/components/app/billing-panel'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Naplata' }

export default async function BillingPage({ searchParams }: PageProps<'/app/billing'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams
  const checkout = sp.checkout === 'success' || sp.checkout === 'canceled' ? sp.checkout : null

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BrandAccountHeader />
        <p className="text-sm text-muted-foreground">
          Plan, tokeni i plaćanja radnog prostora „{current.name}”.
        </p>
      </div>
      <BillingPanel
        workspaceId={current.workspaceId}
        canSeeLedger={ADMIN_ROLES.includes(current.role)}
        checkout={checkout}
      />
    </div>
  )
}
