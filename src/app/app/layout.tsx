import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace, listMemberships } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Layout ne zna pouzdano putanju u RSC/prefetch zahtevima (proxy ih preskače),
 * pa ovde nema preusmeravanja po putanji: svaka stranica koja traži workspace
 * sama radi redirect na /app/onboarding kad ga nema.
 */
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app')

  if (viewer.profile.isBanned) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Nalog je blokiran</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ako mislite da je ovo greška, javite se podršci.</p>
      </main>
    )
  }

  const memberships = await listMemberships(viewer)
  const current = memberships.length ? await getCurrentWorkspace(viewer) : null
  const brands = current ? await listBrands(viewer, current.workspaceId) : []
  const currentBrand = current ? await getCurrentBrand(viewer, current.workspaceId) : null

  return (
    <AppShell
      viewer={{
        email: viewer.user.email,
        fullName: viewer.profile.fullName,
        platformRole: viewer.profile.platformRole,
        mfaVerified: viewer.mfaVerified,
        impersonation: viewer.impersonation
          ? { readOnly: viewer.impersonation.readOnly, expiresAt: viewer.impersonation.expiresAt }
          : null,
      }}
      memberships={memberships}
      current={current}
      brands={brands}
      currentBrand={currentBrand}
    >
      {children}
    </AppShell>
  )
}
