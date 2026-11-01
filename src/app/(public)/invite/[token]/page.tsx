import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { SubmitButton } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { localePath } from '@/i18n/paths'
import { translateServerText } from '@/i18n/server-text'
import { acceptInvitationAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: PageProps<'/invite/[token]'>): Promise<Metadata> {
  const [{ token }, locale, t] = await Promise.all([params, getLocale(), getTranslations('invitePage')])
  return {
    ...publicMetadata({ locale, path: `/invite/${token}`, title: t('metaTitle') }),
    robots: { index: false },
  }
}

export default async function InvitePage({ params, searchParams }: PageProps<'/invite/[token]'>) {
  const { token } = await params
  const sp = await searchParams
  const [locale, t] = await Promise.all([getLocale(), getTranslations('invitePage')])
  // greška stiže u adresi posle neuspele akcije, na srpskom; prevodi se na jezik strane (D-130)
  const error = typeof sp.error === 'string' ? translateServerText(sp.error, locale) : undefined
  const viewer = await getViewer()
  const loginNext = encodeURIComponent(`/invite/${token}`)

  return (
    <AuthCard title={t('title')} description={t('description')}>
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
            {t.rich('signedIn', {
              b: (chunks) => <strong>{chunks}</strong>,
              email: viewer.user.email ?? '',
            })}
          </p>
          <SubmitButton pendingText={t('pending')} className="w-full">
            {t('accept')}
          </SubmitButton>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('signedOut')}</p>
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href={localePath(locale, `/login?next=${loginNext}`) as Route} />}
          >
            {t('login')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<Link href={localePath(locale, `/register?next=${loginNext}`) as Route} />}
          >
            {t('register')}
          </Button>
        </div>
      )}
    </AuthCard>
  )
}
