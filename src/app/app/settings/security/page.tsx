import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { MfaPanel } from '@/components/app/mfa-panel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('security')
  return { title: t('metaTitle') }
}

export default async function SecurityPage({ searchParams }: PageProps<'/app/settings/security'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined
  const t = await getTranslations('security')

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BrandAccountHeader />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('intro')}</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('totp.title')}</CardTitle>
          <CardDescription>{t('totp.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {viewer.impersonation ? (
            <p className="text-sm text-muted-foreground">{t('impersonation')}</p>
          ) : (
            <MfaPanel currentLevel={viewer.mfaVerified ? 'aal2' : 'aal1'} reason={reason} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('password.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t.rich('password.text', {
            link: (chunks) => (
              <Link href="/forgot-password" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </CardContent>
      </Card>
    </div>
  )
}
