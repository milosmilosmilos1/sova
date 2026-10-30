import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace, listMemberships } from '@/lib/auth/workspace'
import { configured, isPreview } from '@/lib/env'
import { isFeatureEnabled } from '@/lib/flags'
import { listBrands } from '@/services/brands'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Režim pregleda (D-101): šta još čeka svoj ključ, da korisnik ne misli da je greška. */
function previewPending(): string[] {
  if (!isPreview) return []
  const pending: string[] = []
  if (!configured.gemini) pending.push('AI tekst i slike')
  if (!configured.inngestCloud) pending.push('zakazano objavljivanje i pozadinski poslovi')
  if (!configured.resend) pending.push('emailovi')
  if (!configured.unsplash) pending.push('Unsplash fotografije')
  if (!configured.pexels) pending.push('Pexels video')
  if (!configured.canva) pending.push('Canva')
  return pending
}

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
  const pending = previewPending()
  const showLocaleSwitcher = await isFeatureEnabled('ui_languages')
  const { count: waitingApprovals } = currentBrand
    ? await viewer.supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', currentBrand.id)
        .eq('status', 'in_review')
        .is('deleted_at', null)
    : { count: 0 }

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
      showLocaleSwitcher={showLocaleSwitcher}
      waitingApprovals={waitingApprovals ?? 0}
    >
      {pending.length ? (
        <p role="status" className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Pregled: još se uključuju {pending.join(', ')}. Ostatak aplikacije radi.
        </p>
      ) : null}
      {children}
    </AppShell>
  )
}
