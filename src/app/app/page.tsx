import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Coins,
  Inbox,
  PenSquare,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { InstallCard } from '@/components/app/install-card'
import { MediaThumb } from '@/components/shared/media-thumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { parsePlaybook } from '@/lib/brand/playbook'
import { GUIDE_HREF, type GuideStepKey } from '@/lib/guide'
import { getOverview } from '@/services/analytics/overview'
import { getBrand, listBrands } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { listFlows } from '@/services/flows/flows'
import { getGuide } from '@/services/guide'
import { getWorkspacePlan } from '@/services/plans'
import { listCalendar } from '@/services/posts/calendar'
import { listReviewDesk } from '@/services/posts/review'
import { listSocialAccounts } from '@/services/social/accounts'
import { countNewSuggestions } from '@/services/suggestions'
import { cn } from 'cn'

const DAY = 86_400_000

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <CardTitle className="text-base">{title}</CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Dan u zoni brenda kao YYYY-MM-DD. */
function zonedDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Početna (D-115): pozdrav i stanje, četiri ključna koraka sa preporučenim sledećim, rezultati za 30
 * dana, nacrti koji čekaju odluku, nedelja, Brain, tokovi i jedan preporučen potez.
 */
export default async function AppHomePage({ searchParams }: PageProps<'/app'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams
  const [t, format] = await Promise.all([getTranslations('home'), getFormatter()])

  const [brands, plan, balanceRes, summary] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
    viewer.supabase.rpc('workspace_token_balance', { p_workspace_id: current.workspaceId }),
    getCurrentBrand(viewer, current.workspaceId),
  ])
  const balance = (balanceRes.data as { total: number; reserved: number; available: number } | null) ?? null
  const canEdit = EDIT_ROLES.includes(current.role)
  const firstName = viewer.profile.fullName?.split(' ')[0] ?? null

  if (!summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('greeting.day', { name: firstName ?? '' })}
        </h1>
        <p className="text-sm text-muted-foreground">{t('noBrand')}</p>
      </div>
    )
  }

  const now = new Date()
  const tz = summary.timezone
  const todayKey = zonedDay(now, tz)
  const today = new Date(`${todayKey}T00:00:00Z`)
  const weekStart = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY)
  // pregled ne sme da padne zbog jednog dela: svaki izvor ima svoju rezervu
  const [brand, guide, desk, overview, week, flows, accounts, inbox] = await Promise.all([
    getBrand(viewer, summary.id),
    getGuide(viewer, summary.id).catch(() => null),
    listReviewDesk(viewer, { brandId: summary.id, tab: 'waiting' }).catch(() => null),
    getOverview(
      viewer,
      summary.id,
      new Date(now.getTime() - 30 * DAY).toISOString(),
      now.toISOString(),
    ).catch(() => null),
    listCalendar(
      viewer,
      summary.id,
      new Date(weekStart.getTime() - DAY).toISOString(),
      new Date(weekStart.getTime() + 8 * DAY).toISOString(),
    ).catch(() => null),
    listFlows(viewer, summary.id).catch(() => []),
    listSocialAccounts(viewer, summary.id).catch(() => null),
    countNewSuggestions(viewer, summary.id).catch(() => 0),
  ])
  const design = await resolveDesign(brand).catch(() => null)
  const playbook = parsePlaybook(brand.playbook)

  const waiting = desk?.counts.waiting ?? 0
  const active = (accounts?.accounts ?? []).filter((a) => a.status === 'active')
  const reauth = (accounts?.accounts ?? []).filter((a) => a.status === 'needs_reauth').length
  const handle = active.find((a) => a.username)?.username ?? null
  const activeFlows = flows.filter((f) => f.active)
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now),
  )
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening'
  const healthy = reauth === 0 && !flows.some((f) => f.lastRun?.status === 'failed')

  // jedan preporučen potez, po važnosti
  const recommended: { key: 'reauth' | 'approve' | 'tokens' | 'studio' | GuideStepKey; href: Route } =
    reauth > 0
      ? { key: 'reauth', href: '/app/accounts' }
      : waiting > 0
        ? { key: 'approve', href: '/app/approvals' }
        : guide?.next
          ? { key: guide.next, href: GUIDE_HREF[guide.next] }
          : balance && balance.available < 10
            ? { key: 'tokens', href: '/app/billing' }
            : { key: 'studio', href: '/app/studio' }

  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY))
  const perDay = new Map<string, number>()
  for (const item of week?.items ?? []) {
    if (!item.scheduledFor || item.status === 'canceled') continue
    const key = zonedDay(new Date(item.scheduledFor), tz)
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const followers = (overview?.followers ?? []).reduce((n, f) => n + (f.last ?? 0), 0)
  const delta = (v: number | null | undefined) =>
    v === null || v === undefined ? null : `${v >= 0 ? '+' : ''}${format.number(Math.round(v))} %`
  const num = (v: number) => format.number(v)
  const platformsLabel = (list: SocialPlatform[]) => list.map((p) => PLATFORMS[p]?.label ?? p).join(', ')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span
              className={cn('size-2 rounded-full', healthy ? 'bg-emerald-500' : 'bg-amber-500')}
              aria-hidden
            />
            {healthy ? t('status.ok') : t('status.check')}
            {handle ? <span>· @{handle}</span> : <span>· {summary.name}</span>}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? t(`greeting.${greeting}`, { name: firstName }) : t(`greetingPlain.${greeting}`)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {waiting ? t('subtitle.waiting', { count: waiting }) : t('subtitle.calm')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/app/approvals" />}>
            <CheckCircle2 /> {t('actions.review', { count: waiting })}
          </Button>
          {canEdit ? (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/app/posts/new" />}>
                <PenSquare /> {t('actions.newPost')}
              </Button>
              <Button nativeButton={false} render={<Link href="/app/flows/new" />}>
                <Workflow /> {t('actions.newFlow')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {canEdit && !summary.setup_completed_at ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{t('banner.setupTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('banner.setupText', { brand: summary.name })}
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/app/setup" />}>
              {t('banner.setupCta')} <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {canEdit && design && !design.logoSource ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{t('banner.logo')}</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/brand/visual" />}>
            {t('banner.logoCta')}
          </Button>
        </div>
      ) : null}
      {sp.password === 'changed' ? (
        <p
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {t('passwordChanged')}
        </p>
      ) : null}

      {guide && guide.next ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                  {t('steps.eyebrow')}
                </p>
                <CardTitle className="text-lg">{t('steps.title')}</CardTitle>
                <CardDescription>{t('steps.text')}</CardDescription>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {t('steps.progress', { done: guide.done, total: guide.steps.length })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="grid gap-3 sm:grid-cols-4">
              {guide.steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3 sm:flex-col sm:text-center">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold',
                      s.done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : guide.next === s.key
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {s.done ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t(`steps.items.${s.key}.title`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.done ? t('steps.done') : guide.next === s.key ? t('steps.next') : t('steps.later')}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                  {t('steps.recommended')}
                </p>
                <p className="font-medium">{t(`steps.items.${guide.next}.title`)}</p>
                <p className="text-sm text-muted-foreground">{t(`steps.items.${guide.next}.why`)}</p>
              </div>
              <Button nativeButton={false} render={<Link href={GUIDE_HREF[guide.next]} />}>
                {t(`steps.items.${guide.next}.cta`)} <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section icon={TrendingUp} title={t('pulse.title')} description={t('pulse.text')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: t('pulse.followers'), value: followers ? num(followers) : '—', change: null },
              {
                label: t('pulse.reach'),
                value: overview?.totals.reach ? num(overview.totals.reach) : '—',
                change: delta(overview?.deltas.reach),
              },
              {
                label: t('pulse.engagement'),
                value: overview?.totals.engagement ? num(overview.totals.engagement) : '—',
                change: delta(overview?.deltas.engagement),
              },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{m.value}</p>
                {m.change ? (
                  <p className="text-xs text-muted-foreground">{t('pulse.change', { change: m.change })}</p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {overview?.totals.posts ? t('pulse.posts', { count: overview.totals.posts }) : t('pulse.empty')}
          </p>
        </Section>

        <Section
          icon={CheckCircle2}
          title={t('review.title')}
          description={t('review.text')}
          action={
            waiting ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {t('review.badge', { count: waiting })}
              </span>
            ) : null
          }
        >
          {desk?.items.length ? (
            <ul className="space-y-2">
              {desk.items.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link
                    href="/app/approvals"
                    className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                  >
                    {item.thumb ? (
                      <MediaThumb url={item.thumb} kind={item.thumbKind} className="size-12 rounded-md" />
                    ) : (
                      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-muted">
                        <PenSquare className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.title ?? t('review.untitled')}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[item.flowName, platformsLabel(item.platforms)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t('review.empty')}
            </p>
          )}
          <Button
            className="mt-4 w-full"
            variant={waiting ? 'default' : 'outline'}
            nativeButton={false}
            render={<Link href="/app/approvals" />}
          >
            {t('review.open')} <ArrowRight />
          </Button>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section
          icon={CalendarDays}
          title={t('week.title')}
          description={t('week.text', { timezone: tz })}
          action={
            <Link href="/app/calendar" className="text-sm font-medium text-primary hover:underline">
              {t('week.open')}
            </Link>
          }
        >
          <ol className="grid grid-cols-7 gap-1.5">
            {weekDays.map((d) => {
              const key = d.toISOString().slice(0, 10)
              const count = perDay.get(key) ?? 0
              const isToday = key === todayKey
              return (
                <li
                  key={key}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center',
                    isToday && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'text-[11px] uppercase',
                      isToday ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {format.dateTime(d, { weekday: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{d.getUTCDate()}</span>
                  <span
                    className={cn(
                      'text-[11px]',
                      isToday ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {count || '·'}
                  </span>
                </li>
              )
            })}
          </ol>
        </Section>

        <section className="flex flex-col justify-between gap-4 rounded-xl bg-gradient-to-br from-primary to-indigo-700 p-5 text-white">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/80 uppercase">
              <Brain className="size-4" aria-hidden /> {t('brain.eyebrow')}
            </p>
            <p className="text-lg font-semibold">
              {playbook?.summary
                ? playbook.summary
                : guide?.next === 'flow'
                  ? t('brain.needFlow')
                  : guide?.next === 'voice' || guide?.next === 'networks'
                    ? t('brain.needBasics')
                    : t('brain.learning')}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-white/80">
            <span>
              {playbook
                ? t('brain.rules', { count: playbook.works.length + playbook.avoid.length })
                : t('brain.noPlaybook')}
            </span>
            <Link href="/app/brain" className="font-semibold text-white hover:underline">
              {t('brain.open')} →
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section
          icon={Workflow}
          title={t('flows.title', { active: activeFlows.length, total: flows.length })}
          description={t('flows.text')}
          action={
            <Link href="/app/flows" className="text-sm font-medium text-primary hover:underline">
              {t('flows.manage')}
            </Link>
          }
        >
          {flows.length ? (
            <ul className="divide-y">
              {flows.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/app/flows/${f.id}`}
                    className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        f.active ? 'bg-emerald-500' : 'bg-zinc-300',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {f.nextRunAt && f.active
                          ? t('flows.next', {
                              when: format.dateTime(new Date(f.nextRunAt), {
                                timeZone: tz,
                                weekday: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              }),
                            })
                          : t('flows.paused')}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        f.active ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {f.active ? t('flows.active') : t('flows.pausedBadge')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p>{t('flows.empty')}</p>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/app/flows/new" />}
                >
                  {t('actions.newFlow')} <ArrowRight />
                </Button>
              ) : null}
            </div>
          )}
        </Section>

        <div className="space-y-6">
          <Section icon={Sparkles} title={t('recommended.title')} description={t('recommended.text')}>
            <p className="font-medium">
              {t(`recommended.items.${recommended.key}.title`, {
                count: recommended.key === 'reauth' ? reauth : waiting,
              })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`recommended.items.${recommended.key}.text`)}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={recommended.href} />}
            >
              {t(`recommended.items.${recommended.key}.cta`)} <ArrowRight />
            </Button>
          </Section>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/app/billing"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <Coins className="size-5 text-primary" aria-hidden />
              <span>
                <span className="block text-xs text-muted-foreground">
                  {t('tokens.label', { plan: plan.name })}
                </span>
                <span className="block text-lg font-semibold tabular-nums">
                  {balance ? num(balance.available) : '—'}
                </span>
              </span>
            </Link>
            <Link
              href="/app/inbox"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <Inbox className="size-5 text-primary" aria-hidden />
              <span>
                <span className="block text-xs text-muted-foreground">{t('inbox')}</span>
                <span className="block text-lg font-semibold tabular-nums">{num(inbox)}</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      {overview?.topPosts.length ? (
        <Section
          icon={Users}
          title={t('top.title')}
          description={t('top.text')}
          action={
            <Link href="/app/analytics" className="text-sm font-medium text-primary hover:underline">
              {t('top.open')}
            </Link>
          }
        >
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase">
                  <th className="pb-2 font-medium">{t('top.date')}</th>
                  <th className="pb-2 font-medium">{t('top.post')}</th>
                  <th className="pb-2 text-right font-medium">{t('top.reach')}</th>
                  <th className="pb-2 text-right font-medium">{t('top.engagement')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overview.topPosts.slice(0, 5).map((p) => (
                  <tr key={p.targetId}>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {format.dateTime(new Date(p.publishedAt), {
                        timeZone: tz,
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="max-w-0 py-2 pr-3">
                      <span className="block truncate">{p.title ?? p.excerpt}</span>
                      <span className="block text-xs text-muted-foreground">
                        {PLATFORMS[p.platform]?.label ?? p.platform}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.reach !== null ? num(p.reach) : '—'}</td>
                    <td className="py-2 text-right tabular-nums">{num(p.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <InstallCard />

      {brands.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          {t('brands', { count: brands.length, limit: plan.limits.brands })}
        </p>
      ) : null}
    </div>
  )
}
