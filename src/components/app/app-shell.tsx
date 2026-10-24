import {
  Brain,
  CalendarDays,
  FileText,
  Home,
  LogOut,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { AutoSubmitSelect } from '@/components/app/auto-submit-select'
import { NotificationsBell } from '@/components/app/notifications-bell'
import { CurrentPathInput, NavLink } from '@/components/app/nav-link'
import { Badge } from '@/components/ui/badge'
import { signOutAction, switchBrandAction, switchWorkspaceAction } from '@/lib/auth/actions'
import type { Membership } from '@/lib/auth/workspace'
import type { BrandSummary } from '@/services/brands'

export interface ShellViewer {
  email: string
  fullName: string | null
  platformRole: 'user' | 'platform_admin'
  mfaVerified: boolean
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
  children,
}: {
  viewer: ShellViewer
  memberships: Membership[]
  current: Membership | null
  brands: BrandSummary[]
  currentBrand: BrandSummary | null
  children: ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex w-full flex-col gap-4 border-b bg-sidebar p-4 md:min-h-screen md:w-64 md:border-r md:border-b-0">
        <div className="flex items-center justify-between">
          <Link href="/app" className="text-lg font-semibold tracking-tight">
            Sova
          </Link>
          <NotificationsBell workspaceId={current?.workspaceId ?? null} />
        </div>

        {current ? (
          <div className="space-y-2">
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
            <p className="px-1 text-xs text-muted-foreground">
              Uloga: {ROLE_LABEL[current.role]}
              {currentBrand ? ` · ${currentBrand.name}` : ''}
            </p>
          </div>
        ) : null}

        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Glavna navigacija">
          <NavLink href="/app" exact>
            <Home className="size-4" aria-hidden />
            Početna
          </NavLink>
          <NavLink href="/app/posts">
            <FileText className="size-4" aria-hidden />
            Objave
          </NavLink>
          <NavLink href="/app/calendar">
            <CalendarDays className="size-4" aria-hidden />
            Kalendar
          </NavLink>
          <NavLink href="/app/strategy">
            <Target className="size-4" aria-hidden />
            Strategija
          </NavLink>
          <NavLink href="/app/studio">
            <Sparkles className="size-4" aria-hidden />
            AI Studio
          </NavLink>
          <NavLink href="/app/brand">
            <Brain className="size-4" aria-hidden />
            Brand Brain
          </NavLink>
          <NavLink href="/app/accounts">
            <Share2 className="size-4" aria-hidden />
            Mreže
          </NavLink>
          <NavLink href="/app/team">
            <Users className="size-4" aria-hidden />
            Tim
          </NavLink>
          <NavLink href="/app/settings">
            <Settings className="size-4" aria-hidden />
            Podešavanja
          </NavLink>
          {viewer.platformRole === 'platform_admin' ? (
            <NavLink href="/admin">
              <ShieldCheck className="size-4" aria-hidden />
              Admin
              {!viewer.mfaVerified ? <Badge variant="outline">MFA</Badge> : null}
            </NavLink>
          ) : null}
        </nav>

        <div className="mt-auto space-y-2 border-t pt-4 text-sm">
          <p className="truncate font-medium">{viewer.fullName ?? viewer.email}</p>
          <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden />
              Odjavite se
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  )
}
