import {
  Bot,
  Brain,
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  Inbox,
  LogOut,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ImpersonationBanner } from '@/components/admin/impersonation-banner'
import { SovaLogo } from '@/components/brand/sova-logo'
import { AuthSync } from '@/components/app/auth-sync'
import { AutoSubmitSelect } from '@/components/app/auto-submit-select'
import { NotificationsBell } from '@/components/app/notifications-bell'
import { CurrentPathInput, NavGroup, NavLink } from '@/components/app/nav-link'
import { LocaleSwitcher } from '@/components/shared/locale-switcher'
import { Badge } from '@/components/ui/badge'
import { signOutAction, switchBrandAction, switchWorkspaceAction } from '@/lib/auth/actions'
import type { Membership } from '@/lib/auth/workspace'
import type { BrandSummary } from '@/services/brands'

export interface ShellViewer {
  email: string
  fullName: string | null
  platformRole: 'user' | 'platform_admin'
  mfaVerified: boolean
  /** Tokom impersonacije: viewer je ciljni korisnik, a traka nudi izlaz. */
  impersonation: { readOnly: boolean; expiresAt: string } | null
}

const ROLE_LABEL: Record<Membership['role'], string> = {
  owner: 'vlasnik',
  admin: 'administrator',
  editor: 'urednik',
  approver: 'odobravalac',
  viewer: 'posmatrač',
}

export function AppShell({
  viewer,
  memberships,
  current,
  brands,
  currentBrand,
  showLocaleSwitcher = false,
  children,
}: {
  viewer: ShellViewer
  memberships: Membership[]
  current: Membership | null
  brands: BrandSummary[]
  currentBrand: BrandSummary | null
  /** izbor jezika interfejsa (D-108); prekidač ui_languages dok se svi ekrani ne prevedu */
  showLocaleSwitcher?: boolean
  children: ReactNode
}) {
  return (
    <>
      <AuthSync />
      {viewer.impersonation ? (
        <ImpersonationBanner
          userEmail={viewer.email}
          readOnly={viewer.impersonation.readOnly}
          expiresAt={viewer.impersonation.expiresAt}
        />
      ) : null}
      <div className="flex min-h-full flex-1 flex-col md:flex-row">
        <aside className="flex w-full flex-col gap-5 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-r md:border-b-0">
          <div className="flex items-center justify-between">
            <Link href="/app" aria-label="Sova, početna">
              <SovaLogo />
            </Link>
            <NotificationsBell workspaceId={current?.workspaceId ?? null} />
          </div>

          {current ? (
            <div className="space-y-2 rounded-lg border border-sidebar-border bg-background/60 p-2">
              <form action={switchWorkspaceAction}>
                <CurrentPathInput />
                <AutoSubmitSelect
                  name="workspaceId"
                  value={current.workspaceId}
                  ariaLabel="Radni prostor"
                  options={memberships.map((m) => ({ value: m.workspaceId, label: m.name }))}
                />
              </form>
              {brands.length > 1 && currentBrand ? (
                <form action={switchBrandAction}>
                  <CurrentPathInput />
                  <AutoSubmitSelect
                    name="brandId"
                    value={currentBrand.id}
                    ariaLabel="Brend"
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  />
                </form>
              ) : null}
              <p className="truncate px-1 text-xs text-muted-foreground">
                {ROLE_LABEL[current.role]}
                {currentBrand ? ` · ${currentBrand.name}` : ''}
              </p>
            </div>
          ) : null}

          <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-4" aria-label="Glavna navigacija">
            <NavGroup label="Rad">
              <NavLink href="/app" exact>
                <Home aria-hidden />
                Početna
              </NavLink>
              <NavLink href="/app/inbox">
                <Inbox aria-hidden />
                Inbox
              </NavLink>
              <NavLink href="/app/posts">
                <FileText aria-hidden />
                Objave
              </NavLink>
              <NavLink href="/app/calendar">
                <CalendarDays aria-hidden />
                Kalendar
              </NavLink>
            </NavGroup>
            <NavGroup label="Plan i rast">
              <NavLink href="/app/strategy">
                <Target aria-hidden />
                Strategija
              </NavLink>
              <NavLink href="/app/analytics">
                <TrendingUp aria-hidden />
                Analitika
              </NavLink>
              <NavLink href="/app/autopilot">
                <Bot aria-hidden />
                Autopilot
              </NavLink>
            </NavGroup>
            <NavGroup label="Sadržaj">
              <NavLink href="/app/studio">
                <Sparkles aria-hidden />
                AI Studio
              </NavLink>
              <NavLink href="/app/brand">
                <Brain aria-hidden />
                Brand Brain
              </NavLink>
            </NavGroup>
            <NavGroup label="Podešavanja">
              <NavLink href="/app/accounts">
                <Share2 aria-hidden />
                Mreže
              </NavLink>
              <NavLink href="/app/team">
                <Users aria-hidden />
                Tim
              </NavLink>
              <NavLink href="/app/billing">
                <CreditCard aria-hidden />
                Naplata
              </NavLink>
              <NavLink href="/app/settings">
                <Settings aria-hidden />
                Podešavanja
              </NavLink>
              {viewer.platformRole === 'platform_admin' && !viewer.impersonation ? (
                <NavLink href="/admin">
                  <ShieldCheck aria-hidden />
                  Admin
                  {!viewer.mfaVerified ? <Badge variant="outline">MFA</Badge> : null}
                </NavLink>
              ) : null}
            </NavGroup>
          </nav>

          <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
            {showLocaleSwitcher ? <LocaleSwitcher /> : null}
            <div className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              >
                {(viewer.fullName ?? viewer.email).trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{viewer.fullName ?? viewer.email}</p>
                <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  title={viewer.impersonation ? 'Završite impersonaciju' : 'Odjavite se'}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span className="sr-only">
                    {viewer.impersonation ? 'Završite impersonaciju' : 'Odjavite se'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </>
  )
}
