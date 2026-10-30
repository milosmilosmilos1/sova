import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Coins,
  Inbox,
  PenSquare,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { AUTOPILOT_LEVELS, type AutopilotLevel } from '@/lib/autopilot/rules'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { getOverview } from '@/services/analytics/overview'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { listCalendar } from '@/services/posts/calendar'
import { listSocialAccounts } from '@/services/social/accounts'
import { activeStrategy } from '@/services/strategy/strategy'
import { countNewSuggestions } from '@/services/suggestions'
import { cn } from 'cn'

const nf = new Intl.NumberFormat('sr-Latn-RS')

function StatTile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {children ? <div className="text-xs text-muted-foreground">{children}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AppHomePage({ searchParams }: PageProps<'/app'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams

  const [brands, plan, balanceRes, currentBrand] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
    viewer.supabase.rpc('workspace_token_balance', { p_workspace_id: current.workspaceId }),
    getCurrentBrand(viewer, current.workspaceId),
  ])
  const balance = (balanceRes.data as { total: number; reserved: number; available: number } | null) ?? null
  const level = (currentBrand?.autopilot_level ?? 0) as AutopilotLevel

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString()
  // pregled ne sme da padne zbog jednog dela: svaki izvor ima svoju rezervu
  const [inboxCount, overview, calendar, accounts, profile, strategy] = currentBrand
    ? await Promise.all([
        countNewSuggestions(viewer, currentBrand.id).catch(() => 0),
        getOverview(viewer, currentBrand.id, weekAgo, now.toISOString()).catch(() => null),
        listCalendar(viewer, currentBrand.id, now.toISOString(), weekAhead).catch(() => null),
        listSocialAccounts(viewer, currentBrand.id).catch(() => null),
        getCurrentProfileRow(currentBrand.id).catch(() => null),
        activeStrategy(viewer, currentBrand.id).catch(() => null),
      ])
    : [0, null, null, null, null, null]

  const upcoming = (calendar?.items ?? [])
    .filter((i) => i.scheduledFor && ['scheduled', 'approved', 'in_review'].includes(i.status))
    .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))
  const tz = calendar?.timezone ?? overview?.timezone ?? 'Europe/Belgrade'
  const when = (iso: string) =>
    new Date(iso).toLocaleString('sr-Latn-RS', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  const reachDelta = overview?.deltas.reach ?? null

  const steps = [
    { done: Boolean(profile), label: 'Analiza sajta (Brand Brain)', href: '/app/brand' as const },
    { done: (accounts?.accounts.length ?? 0) > 0, label: 'Povezane mreže', href: '/app/accounts' as const },
    { done: Boolean(strategy), label: 'Strategija za mesec', href: '/app/strategy' as const },
    { done: upcoming.length > 0, label: 'Prva zakazana objava', href: '/app/posts/new' as const },
  ]
  const stepsLeft = steps.filter((s) => !s.done).length
  const setupBanner =
    currentBrand && !currentBrand.setup_completed_at && EDIT_ROLES.includes(current.role)
      ? await getTranslations('setup.banner')
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dobro došli{viewer.profile.fullName ? `, ${viewer.profile.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            Radni prostor <strong>{current.name}</strong> · plan {plan.name}
            {currentBrand ? ` · ${currentBrand.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/app/posts/new" />}>
            <PenSquare /> Nova objava
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/app/studio" />}>
            <Sparkles /> AI Studio
          </Button>
        </div>
      </div>
      {setupBanner && currentBrand ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{setupBanner('title')}</p>
              <p className="text-sm text-muted-foreground">
                {setupBanner('text', { brand: currentBrand.name })}
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/app/setup" />}>
              {setupBanner('cta')} <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {sp.password === 'changed' ? (
        <p
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          Lozinka je promenjena.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Coins} label="Tokeni" value={balance ? nf.format(balance.available) : '—'}>
          {balance?.reserved ? `${balance.reserved} u radu · ` : ''}
          <Link href="/app/billing" className="text-primary hover:underline">
            Dopunite
          </Link>
        </StatTile>
        <StatTile icon={CalendarClock} label="Zakazano za 7 dana" value={nf.format(upcoming.length)}>
          <Link href="/app/calendar" className="text-primary hover:underline">
            Otvori kalendar
          </Link>
        </StatTile>
        <StatTile
          icon={TrendingUp}
          label="Doseg za 7 dana"
          value={overview ? nf.format(overview.totals.reach) : '—'}
        >
          {reachDelta !== null ? (
            <span className={cn(reachDelta >= 0 ? 'text-success' : 'text-destructive')}>
              {reachDelta >= 0 ? '+' : ''}
              {nf.format(Math.round(reachDelta))} % u odnosu na prethodnih 7 dana
            </span>
          ) : (
            'Metrike stižu posle prvih objava.'
          )}
        </StatTile>
        <StatTile icon={Inbox} label="Predlozi u Inboxu" value={nf.format(inboxCount)}>
          Autopilot: {AUTOPILOT_LEVELS[level].label.toLowerCase()}
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sledeće objave</CardTitle>
            <CardDescription>Narednih 7 dana, u zoni brenda ({tz}).</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                <p>Nema zakazanih objava za narednu nedelju.</p>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/app/posts/new" />}
                >
                  Napravite objavu <ArrowRight />
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((item) => (
                  <li key={item.postId}>
                    <Link
                      href={`/app/posts/${item.postId}`}
                      className="-mx-2 flex items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                    >
                      <span className="w-28 shrink-0 text-sm font-medium tabular-nums">
                        {when(item.scheduledFor!)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{item.title ?? item.excerpt}</span>
                      <span className="hidden shrink-0 gap-1 sm:flex">
                        {[...new Set(item.targets.map((t) => t.platform))].map((p) => (
                          <span
                            key={p}
                            className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {PLATFORMS[p as SocialPlatform]?.label ?? p}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{stepsLeft ? 'Prvi koraci' : 'Sve je spremno'}</CardTitle>
            <CardDescription>
              {stepsLeft
                ? `Još ${stepsLeft} do kraja podešavanja brenda.`
                : 'Brend je podešen; Sova radi po strategiji.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link
                    href={s.href}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    {s.done ? (
                      <CheckCircle2 className="size-4 text-success" aria-hidden />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn(s.done && 'text-muted-foreground line-through')}>{s.label}</span>
                    <span className="sr-only">{s.done ? '(urađeno)' : '(nije urađeno)'}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {brands.length ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Brendovi: {brands.length} od {plan.limits.brands}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
