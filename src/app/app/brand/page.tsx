import { Brain, Globe } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { VoiceCard } from '@/components/brand/voice-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brandAccount')
  return { title: t('title') }
}

/** Brend i nalog, kartica Glas brenda (D-113): glas, PDF-ovi, veza ka Brain-u i analizi sajta. */
export default async function BrandPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/brand')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const canEdit = EDIT_ROLES.includes(current.role)
  const [t, format, crawl] = await Promise.all([
    getTranslations('brandAccount'),
    getFormatter(),
    viewer.supabase
      .from('website_crawls')
      .select('url, status, finished_at')
      .eq('brand_id', brand.id)
      .in('status', ['succeeded', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const site = crawl.data
  return (
    <div className="space-y-6">
      <BrandAccountHeader />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Brain className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('brainCard.title')}</p>
              <p className="text-sm text-muted-foreground">{t('brainCard.text')}</p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/app/brain" />}>
              {t('brainCard.open')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Globe className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('site.title')}</p>
              <p className="text-sm break-words text-muted-foreground">
                {site
                  ? t('site.analyzed', {
                      url: site.url.replace(/^https?:\/\//, ''),
                      date: site.finished_at
                        ? format.dateTime(new Date(site.finished_at), { dateStyle: 'medium' })
                        : '',
                    })
                  : t('site.none')}
              </p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/app/brain#sajt" />}>
              {t('site.open')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <VoiceCard
        brandId={brand.id}
        canEdit={canEdit}
        emailVerified={Boolean(viewer.profile.emailVerifiedAt)}
      />
    </div>
  )
}
