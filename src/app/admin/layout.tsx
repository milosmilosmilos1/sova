import type { Metadata, Route } from 'next'
import Link from 'next/link'

import { ImpersonationBanner } from '@/components/admin/impersonation-banner'
import { activeImpersonationFor, requireAdmin } from '@/services/admin/context'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin · Sova' },
  robots: { index: false, follow: false },
}

const NAV: Array<{ href: Route; label: string }> = [
  { href: '/admin', label: 'Pregled' },
  { href: '/admin/users', label: 'Korisnici' },
  { href: '/admin/publishing', label: 'Objave' },
  { href: '/admin/ai-costs', label: 'AI troškovi' },
  { href: '/admin/platform', label: 'Platforma' },
  { href: '/admin/audit', label: 'Audit log' },
]

/**
 * Admin gate (druga provera posle proxy-ja): stvarni korisnik je platform_admin sa potvrđenim MFA
 * (i tokom impersonacije, D-070). Ne-admin dobija 404, ne 403, da se ne otkriva postojanje panela.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const viewer = await requireAdmin()
  const imp = await activeImpersonationFor(viewer.user.id)
  return (
    <div className="flex min-h-full flex-col">
      {imp ? (
        <ImpersonationBanner userEmail={imp.userEmail} readOnly={imp.readOnly} expiresAt={imp.expiresAt} />
      ) : null}
      <header className="border-b bg-sidebar">
        <div className="mx-auto flex min-h-12 w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin" className="font-semibold">
              Sova · Admin
            </Link>
            <nav className="flex flex-wrap gap-3" aria-label="Admin navigacija">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="hidden sm:inline">{viewer.user.email}</span>
            <Link href="/app" className="hover:text-foreground">
              Nazad u aplikaciju
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
