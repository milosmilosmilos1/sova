import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { AppShell } from '@/components/app/app-shell'
import { isAppLocale, LOCALE_COOKIE } from '@/i18n/config'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace, listMemberships } from '@/lib/auth/workspace'
import { configured, isPreview } from '@/lib/env'
import { logger } from '@/lib/logger'
import { listBrands } from '@/services/brands'

export const metadata: Metadata = { robots: { index: false, follow: false } }

type PreviewItem = 'ai' | 'jobs' | 'email' | 'unsplash' | 'pexels' | 'canva'

/** Režim pregleda (D-101): šta još čeka svoj ključ, da korisnik ne misli da je greška (tekst u shell.preview). */
function previewPending(): PreviewItem[] {
  if (!isPreview) return []
  const pending: PreviewItem[] = []
  if (!configured.gemini) pending.push('ai')
  if (!configured.inngestCloud) pending.push('jobs')
  if (!configured.resend) pending.push('email')
  if (!configured.unsplash) pending.push('unsplash')
  if (!configured.pexels) pending.push('pexels')
  if (!configured.canva) pending.push('canva')
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
  const t = await getTranslations('shell')

  if (viewer.profile.isBanned) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">{t('blocked.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('blocked.text')}</p>
      </main>
    )
  }

  const memberships = await listMemberships(viewer)
  const current = memberships.length ? await getCurrentWorkspace(viewer) : null
  const brands = current ? await listBrands(viewer, current.workspaceId) : []
  const currentBrand = current ? await getCurrentBrand(viewer, current.workspaceId) : null
  const pending = previewPending()
  // jezik izabran na javnom sajtu važi i za mejlove i obaveštenja: profil prati kolačić (D-130)
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  if (!viewer.impersonation && isAppLocale(cookieLocale) && cookieLocale !== viewer.profile.locale) {
    const { error } = await viewer.supabase
      .from('profiles')
      .update({ locale: cookieLocale })
      .eq('id', viewer.user.id)
    if (error) logger.warn('profile_locale_sync_failed', { error: error.message })
    await viewer.supabase.auth.updateUser({ data: { locale: cookieLocale } }).catch(() => undefined)
  }
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
      waitingApprovals={waitingApprovals ?? 0}
    >
      {pending.length ? (
        <p role="status" className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {t('preview.banner', { list: pending.map((item) => t(`preview.${item}`)).join(', ') })}
        </p>
      ) : null}
      {children}
    </AppShell>
  )
}
