import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { CanvaCard } from '@/components/app/canva-card'
import { FigmaCard } from '@/components/app/figma-card'
import { NotificationPrefsCard } from '@/components/app/notification-prefs-card'
import { PrivacyCard } from '@/components/app/privacy-card'
import {
  BrandTimezoneForm,
  CreateBrandForm,
  ProfileForm,
  WorkspaceForm,
} from '@/components/app/settings-forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toContentLocale } from '@/config/locales'
import { deleteBrandAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { authProviders } from '@/services/account'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { countScheduledPosts } from '@/services/posts/publisher'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: t('metaTitle') }
}

export default async function SettingsPage({ searchParams }: PageProps<'/app/settings'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams
  const canvaNotice = typeof sp.canva === 'string' ? sp.canva : null
  const figmaNotice = typeof sp.figma === 'string' ? sp.figma : null
  const [brands, plan, auth] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
    authProviders(viewer.user.id),
  ])
  const scheduledCounts = await countScheduledPosts(
    viewer,
    brands.map((b) => b.id),
  )
  const isAdmin = ADMIN_ROLES.includes(current.role)
  const canEdit = EDIT_ROLES.includes(current.role)
  const [t, tb, tc] = await Promise.all([
    getTranslations('settings'),
    getTranslations('billing'),
    getTranslations('contentLocale'),
  ])
  // naziv plana iz baze se prevodi po kodu; nepoznat kod ostaje sa nazivom iz baze
  const planKey = `planNames.${plan.code}` as 'planNames.free'
  const planName = tb.has(planKey) ? tb(planKey) : plan.name

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BrandAccountHeader />
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{viewer.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={viewer.profile.fullName ?? ''}
            locale={viewer.profile.locale}
            timezone={viewer.profile.timezone}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            {t.rich('profile.security', {
              link: (chunks) => (
                <Link href="/app/settings/security" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('workspace.title')}</CardTitle>
          <CardDescription>
            {t.rich('workspace.plan', {
              plan: planName,
              brands: plan.limits.brands,
              networks: plan.limits.social_accounts,
              members: plan.limits.members,
              badge: (chunks) => <Badge variant="secondary">{chunks}</Badge>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <WorkspaceForm workspaceId={current.workspaceId} name={current.name} type={current.type} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('workspace.readOnly', {
                name: current.name,
                type: current.type === 'agency' ? t('workspace.agency') : t('workspace.business'),
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <NotificationPrefsCard workspaceId={current.workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle>{t('brands.title')}</CardTitle>
          <CardDescription>{t('brands.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y">
            {brands.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.website_url ?? t('brands.noWebsite')} · {tc(toContentLocale(b.content_locale))} ·{' '}
                    {b.timezone}
                    {scheduledCounts[b.id]
                      ? ` · ${t('brands.scheduled', { count: scheduledCounts[b.id] ?? 0 })}`
                      : ''}
                  </div>
                  {canEdit ? (
                    <BrandTimezoneForm
                      brandId={b.id}
                      timezone={b.timezone}
                      scheduledCount={scheduledCounts[b.id] ?? 0}
                    />
                  ) : null}
                </div>
                {isAdmin && brands.length > 1 ? (
                  <form action={deleteBrandAction}>
                    <input type="hidden" name="brandId" value={b.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t('brands.archive')}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? (
            brands.length < plan.limits.brands ? (
              <CreateBrandForm workspaceId={current.workspaceId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t.rich('brands.limit', {
                  plan: planName,
                  link: (chunks) => (
                    <Link href="/app/billing" className="underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <CanvaCard workspaceId={current.workspaceId} canEdit={canEdit} notice={canvaNotice} />

      <FigmaCard workspaceId={current.workspaceId} canEdit={canEdit} notice={figmaNotice} />

      <PrivacyCard
        email={viewer.user.email}
        hasPassword={auth.providers.includes('email')}
        disabledReason={viewer.impersonation ? t('impersonation') : null}
      />
    </div>
  )
}
