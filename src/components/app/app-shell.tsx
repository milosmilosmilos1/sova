import {
  Bot,
  Brain,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  FileText,
  Home,
  Images,
  Inbox,
  Lightbulb,
  LogOut,
  MessageCircleReply,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ImpersonationBanner } from '@/components/admin/impersonation-banner'
import { ApprovalsBadge } from '@/components/app/approvals-badge'
import { BrandMark } from '@/components/brand/brand-mark'
import { SovaLogo } from '@/components/brand/sova-logo'
import { AuthSync } from '@/components/app/auth-sync'
import { GuideWidget } from '@/components/app/guide-widget'
import { ServiceWorkerRegister } from '@/components/app/service-worker'
import { NotificationsBell } from '@/components/app/notifications-bell'
import { ShellSelect } from '@/components/app/shell-select'
import { CurrentPathInput, NavGroup, NavLink } from '@/components/app/nav-link'
import { LocaleSwitcher } from '@/components/shared/locale-switcher'
import { Badge } from '@/components/ui/badge'
import { company } from '@/config/company'
import { signOutAction, switchBrandAction, switchWorkspaceAction } from '@/lib/auth/actions'
import { EDIT_ROLES, type Membership } from '@/lib/auth/workspace'
import { brandSwatch, type BrandSwatch } from '@/lib/brands/swatch'
import type { BrandSummary } from '@/services/brands'

export interface ShellViewer {
  email: string
  fullName: string | null
  platformRole: 'user' | 'platform_admin'
  mfaVerified: boolean
  /** Tokom impersonacije: viewer je ciljni korisnik, a traka nudi izlaz. */
  impersonation: { readOnly: boolean; expiresAt: string } | null
}

export function AppShell({
  viewer,
  memberships,
  current,
  brands,
  currentBrand,
  swatches = {},
  waitingApprovals = 0,
  children,
}: {
  viewer: ShellViewer
  memberships: Membership[]
  current: Membership | null
  brands: BrandSummary[]
  currentBrand: BrandSummary | null
  /** boja svakog brenda (D-137); brend bez nje dobija rezervnu */
  swatches?: Record<string, BrandSwatch>
  /** broj nacrta koji čekaju odluku (D-108), značka uz „Odobravanje” */
  waitingApprovals?: number
  children: ReactNode
}) {
  const t = useTranslations('shell')
  const swatchOf = (id: string) => swatches[id] ?? brandSwatch(id)
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
            <Link href="/app" aria-label={t('home')}>
              <SovaLogo />
            </Link>
            <NotificationsBell workspaceId={current?.workspaceId ?? null} />
          </div>

          {current ? (
            <div className="space-y-2 rounded-lg border border-sidebar-border bg-background/60 p-2">
              <form action={switchWorkspaceAction}>
                <CurrentPathInput />
                <ShellSelect
                  key={current.workspaceId}
                  name="workspaceId"
                  value={current.workspaceId}
                  ariaLabel={t('workspace')}
                  options={memberships.map((m) => ({ value: m.workspaceId, label: m.name }))}
                />
              </form>
              {brands.length > 1 && currentBrand ? (
                <form action={switchBrandAction}>
                  <CurrentPathInput />
                  <ShellSelect
                    key={currentBrand.id}
                    name="brandId"
                    value={currentBrand.id}
                    ariaLabel={t('brand')}
                    options={brands.map((b) => ({ value: b.id, label: b.name, swatch: swatchOf(b.id) }))}
                  />
                </form>
              ) : null}
              <p className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
                {brands.length <= 1 && currentBrand ? (
                  <BrandMark name={currentBrand.name} swatch={swatchOf(currentBrand.id)} size={16} />
                ) : null}
                <span className="truncate">
                  {t(`roles.${current.role}`)}
                  {currentBrand ? ` · ${currentBrand.name}` : ''}
                </span>
              </p>
              {EDIT_ROLES.includes(current.role) ? (
                <Link
                  href="/app/brands#novi"
                  className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t('addBrand')}
                </Link>
              ) : null}
            </div>
          ) : null}

          <nav
            className="flex gap-1 overflow-x-auto max-md:scrollbar-none max-md:fade-x md:flex-col md:gap-4 md:fade-y md:pt-3 md:pb-8"
            aria-label={t('mainNav')}
          >
            <NavGroup label={t('groups.work')}>
              <NavLink href="/app" exact>
                <Home aria-hidden />
                {t('nav.home')}
              </NavLink>
              <NavLink href="/app/flows">
                <Workflow aria-hidden />
                {t('nav.flows')}
              </NavLink>
              <NavLink href="/app/approvals">
                <CheckCircle2 aria-hidden />
                {t('nav.approvals')}
                <ApprovalsBadge brandId={currentBrand?.id ?? null} initial={waitingApprovals} />
              </NavLink>
              <NavLink href="/app/inbox">
                <Inbox aria-hidden />
                {t('nav.inbox')}
              </NavLink>
              <NavLink href="/app/automations">
                <MessageCircleReply aria-hidden />
                {t('nav.automations')}
              </NavLink>
              <NavLink href="/app/posts">
                <FileText aria-hidden />
                {t('nav.posts')}
              </NavLink>
              <NavLink href="/app/calendar">
                <CalendarDays aria-hidden />
                {t('nav.calendar')}
              </NavLink>
            </NavGroup>
            <NavGroup label={t('groups.growth')}>
              <NavLink href="/app/plan">
                <CalendarRange aria-hidden />
                {t('nav.plan')}
              </NavLink>
              <NavLink href="/app/strategy">
                <Target aria-hidden />
                {t('nav.strategy')}
              </NavLink>
              <NavLink href="/app/analytics">
                <TrendingUp aria-hidden />
                {t('nav.analytics')}
              </NavLink>
              <NavLink href="/app/autopilot">
                <Bot aria-hidden />
                {t('nav.autopilot')}
              </NavLink>
            </NavGroup>
            <NavGroup label={t('groups.content')}>
              <NavLink href="/app/studio">
                <Sparkles aria-hidden />
                {t('nav.studio')}
              </NavLink>
              <NavLink href="/app/gallery">
                <Images aria-hidden />
                {t('nav.gallery')}
              </NavLink>
              <NavLink href="/app/brain">
                <Brain aria-hidden />
                {t('nav.brain')}
              </NavLink>
            </NavGroup>
            <NavGroup label={t('groups.settings')}>
              <NavLink href="/app/accounts">
                <Share2 aria-hidden />
                {t('nav.accounts')}
              </NavLink>
              <NavLink href="/app/team">
                <Users aria-hidden />
                {t('nav.team')}
              </NavLink>
              <NavLink href="/app/brand" also={['/app/brands', '/app/billing', '/app/settings']}>
                <Settings aria-hidden />
                {t('nav.brandAccount')}
              </NavLink>
              <NavLink href="/app/ideas">
                <Lightbulb aria-hidden />
                {t('nav.ideas')}
              </NavLink>
              {viewer.platformRole === 'platform_admin' && !viewer.impersonation ? (
                <NavLink href="/admin">
                  <ShieldCheck aria-hidden />
                  {t('nav.admin')}
                  {!viewer.mfaVerified ? <Badge variant="outline">MFA</Badge> : null}
                </NavLink>
              ) : null}
            </NavGroup>
          </nav>

          {/* na telefonu jezik i nalog u jednom redu, da sadržaj strane počne više */}
          <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border pt-3 md:block md:space-y-3 md:pt-4">
            <LocaleSwitcher className="min-w-0 flex-1" />
            <div className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                title={viewer.email}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              >
                {(viewer.fullName ?? viewer.email).trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 max-md:hidden">
                <p className="truncate font-medium">{viewer.fullName ?? viewer.email}</p>
                <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  title={viewer.impersonation ? t('endImpersonation') : t('signOut')}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span className="sr-only">
                    {viewer.impersonation ? t('endImpersonation') : t('signOut')}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </aside>
        {/* pb-24: poslednji red strane ne ostaje ispod plutajućeg dugmeta „Vodič i podrška” */}
        <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8">{children}</main>
      </div>
      {currentBrand && !viewer.impersonation ? (
        <GuideWidget brandId={currentBrand.id} supportEmail={company.supportEmail} />
      ) : null}
      <ServiceWorkerRegister />
    </>
  )
}
