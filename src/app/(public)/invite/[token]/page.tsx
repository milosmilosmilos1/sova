import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthCard } from '@/components/auth/auth-card'
import { SubmitButton } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { acceptInvitationAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'

export const metadata: Metadata = { title: 'Pozivnica', robots: { index: false } }

export default async function InvitePage({ params, searchParams }: PageProps<'/invite/[token]'>) {
  const { token } = await params
  const sp = await searchParams
  const error = typeof sp.error === 'string' ? sp.error : undefined
  const viewer = await getViewer()
  const loginNext = encodeURIComponent(`/invite/${token}`)

  return (
    <AuthCard title="Pozivnica u radni prostor" description="Neko vas je pozvao da sarađujete u Sovi.">
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {viewer ? (
        <form action={acceptInvitationAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-muted-foreground">
            Prijavljeni ste kao <strong>{viewer.user.email}</strong>. Pozivnica važi samo za adresu na koju je
            poslata.
          </p>
          <SubmitButton pendingText="Prihvatam…" className="w-full">
            Prihvatite pozivnicu
          </SubmitButton>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Prijavite se ili napravite nalog sa email adresom na koju je pozivnica stigla.
          </p>
          <Button className="w-full" nativeButton={false} render={<Link href={`/login?next=${loginNext}`} />}>
            Prijavite se
          </Button>
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/register?next=${loginNext}`} />}
          >
            Napravite nalog
          </Button>
        </div>
      )}
    </AuthCard>
  )
}
