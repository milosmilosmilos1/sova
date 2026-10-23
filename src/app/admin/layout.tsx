import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getViewer } from '@/lib/auth/viewer'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin · Sova' },
  robots: { index: false, follow: false },
}

/**
 * Admin gate (druga provera posle proxy-ja): platform_admin + MFA potvrđena u sesiji.
 * Korisnik koji nije admin dobija 404, ne 403, da se ne otkriva postojanje panela.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/admin')
  if (viewer.profile.platformRole !== 'platform_admin' || viewer.profile.isBanned) notFound()
  if (!viewer.mfaVerified) redirect('/app/settings/security?reason=admin')

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-sidebar">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 text-sm">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold">
              Sova · Admin
            </Link>
          </div>
          <Link href="/app" className="text-muted-foreground hover:text-foreground">
            Nazad u aplikaciju
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
