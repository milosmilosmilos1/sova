import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.dataDeletion')])
  return publicMetadata({
    locale,
    path: '/data-deletion',
    title: t('title'),
    description: t('metaDescription'),
  })
}

const STEPS = ['login', 'open', 'confirm', 'result'] as const
const SCOPE = ['deleted', 'kept', 'member'] as const

/**
 * Uputstvo za brisanje podataka na jeziku strane (D-130). Srpska strana ima i kratko uputstvo na
 * engleskom (za recenzente mreža); engleska i ukrajinska strana imaju ceo tekst na svom jeziku.
 */
export default async function DataDeletionPage({ searchParams }: PageProps<'/data-deletion'>) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : null
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.dataDeletion')])
  const subject = encodeURIComponent(t('s3.subject'))

  return (
    <LegalPage title={t('title')} titleEn="Data Deletion Instructions">
      {code ? (
        <div className="rounded-lg border bg-muted p-4">
          <p className="font-medium">{t('received.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t.rich('received.text', {
              code,
              mono: (chunks: ReactNode) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      <LegalSection title={t('s1.title')}>
        <LegalList items={STEPS.map((key) => t(`s1.items.${key}`))} />
        <p>{t('s1.note')}</p>
      </LegalSection>

      <LegalSection title={t('s2.title')}>
        <p>{t('s2.p1')}</p>
        <p>{t('s2.p2')}</p>
      </LegalSection>

      <LegalSection title={t('s3.title')}>
        <p>
          {t.rich('s3.text', {
            mail: (chunks) => <a href={`mailto:${company.privacyEmail}?subject=${subject}`}>{chunks}</a>,
            email: company.privacyEmail,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('s4.title')}>
        <LegalList items={SCOPE.map((key) => t(`s4.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s5.title')}>
        <p>{t('s5.text')}</p>
      </LegalSection>

      {locale === 'sr-Latn' ? (
        <>
          <hr />

          <LegalSection title="Data Deletion (English)">
            <LegalList
              items={[
                'Delete your whole account in the app: Settings → Privacy and data → Delete account, type your email to confirm. Tokens for all connected networks are revoked immediately, scheduled posts are cancelled and data is deleted; backups are purged within 30 days.',
                'Disconnect a single network: Networks → Disconnect. The token, imported posts and metrics for that account are deleted. Content already published stays on the network.',
                <>
                  Request by email: write from your registered address to{' '}
                  <a href={`mailto:${company.privacyEmail}?subject=Data%20deletion`}>
                    {company.privacyEmail}
                  </a>{' '}
                  with the subject “Data deletion”. We verify your identity and delete within 30 days.
                </>,
                'Invoices and payment records are kept for the period required by accounting law; everything else is deleted.',
                'When you remove Sova from your Facebook or Instagram settings, Meta sends us an automatic deletion request. We delete that account’s data immediately and return a confirmation code with a link to this page.',
              ]}
            />
            <p>
              See also the <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </LegalSection>
        </>
      ) : null}
    </LegalPage>
  )
}
