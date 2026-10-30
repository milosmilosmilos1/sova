import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BrandAccountHeader } from '@/components/brand/brand-account-header'
import { MfaPanel } from '@/components/app/mfa-panel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'

export const metadata: Metadata = { title: 'Bezbednost' }

export default async function SecurityPage({ searchParams }: PageProps<'/app/settings/security'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BrandAccountHeader />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Bezbednost</h2>
          <p className="text-sm text-muted-foreground">Dvofaktorska zaštita i lozinka.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dvofaktorska zaštita (TOTP)</CardTitle>
          <CardDescription>Kod iz aplikacije za autentifikaciju uz lozinku.</CardDescription>
        </CardHeader>
        <CardContent>
          {viewer.impersonation ? (
            <p className="text-sm text-muted-foreground">
              Tokom impersonacije dvofaktorska zaštita se ne prikazuje i ne menja: panel bi radio nad vašim
              admin nalogom, ne nad korisnikovim.
            </p>
          ) : (
            <MfaPanel currentLevel={viewer.mfaVerified ? 'aal2' : 'aal1'} reason={reason} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lozinka</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Promena lozinke ide kroz link na email:{' '}
          <Link href="/forgot-password" className="underline">
            zatražite link
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  )
}
