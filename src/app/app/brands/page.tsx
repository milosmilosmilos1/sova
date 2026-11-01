import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandTimezoneForm, CreateBrandForm } from '@/components/app/settings-forms'
import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toContentLocale } from '@/config/locales'
import { deleteBrandAction, switchBrandAction } from '@/lib/auth/actions'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { countScheduledPosts } from '@/services/posts/publisher'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: t('brands.metaTitle') }
}

/**
 * Brendovi radnog prostora: spisak, prelazak na brend, zona, arhiviranje i novi brend (agencija ima
 * brend za svakog klijenta). Bila je kartica na dnu Podešavanja; sada je svoja kartica u „Brend i nalog”.
 */
export default async function BrandsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const [brands, plan, currentBrand] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
    getCurrentBrand(viewer, current.workspaceId),
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
        <p className="text-sm text-muted-foreground">{t('brands.intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('brands.title')}</CardTitle>
          <CardDescription>
            {t('brands.usage', { used: brands.length, max: plan.limits.brands, plan: planName })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {brands.map((b) => {
              const isCurrent = b.id === currentBrand?.id
              return (
                <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      {isCurrent ? <Badge variant="secondary">{t('brands.current')}</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-xs break-words text-muted-foreground">
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
                  <div className="flex items-center gap-1">
                    {!isCurrent ? (
                      <form action={switchBrandAction}>
                        <input type="hidden" name="brandId" value={b.id} />
                        <input type="hidden" name="next" value="/app" />
                        <Button type="submit" variant="outline" size="sm">
                          {t('brands.open')}
                        </Button>
                      </form>
                    ) : null}
                    {isAdmin && brands.length > 1 ? (
                      <form action={deleteBrandAction}>
                        <input type="hidden" name="brandId" value={b.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t('brands.archive')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card id="novi" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>{t('brands.newTitle')}</CardTitle>
            <CardDescription>{t('brands.newHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {brands.length < plan.limits.brands ? (
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
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
