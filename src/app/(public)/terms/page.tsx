import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { localePath } from '@/i18n/paths'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.terms')])
  return publicMetadata({ locale, path: '/terms', title: t('title'), description: t('metaDescription') })
}

const ACCOUNT = ['age', 'password', 'free', 'team'] as const
const CONTENT = ['yours', 'accuracy', 'responsibility', 'forbidden', 'thirdParty'] as const
const PAYMENT = ['usage', 'allowance', 'renewal', 'prices', 'refunds', 'value'] as const

/**
 * Uslovi korišćenja na jeziku strane (D-130). Srpska strana ima i kratak sažetak na engleskom
 * (za recenzente mreža); engleska i ukrajinska strana imaju ceo tekst na svom jeziku.
 */
export default async function TermsPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.terms')])
  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>
  return (
    <LegalPage title={t('title')} titleEn="Terms of Service">
      <LegalSection title={t('s1.title')}>
        <p>{t.rich('s1.text', { b: strong, company: company.legalName, product: company.productName })}</p>
      </LegalSection>

      <LegalSection title={t('s2.title')}>
        <p>{t('s2.text')}</p>
      </LegalSection>

      <LegalSection title={t('s3.title')}>
        <LegalList items={ACCOUNT.map((key) => t(`s3.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s4.title')}>
        <p>{t('s4.text')}</p>
      </LegalSection>

      <LegalSection title={t('s5.title')}>
        <LegalList items={CONTENT.map((key) => t(`s5.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s6.title')}>
        <LegalList items={PAYMENT.map((key) => t(`s6.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s7.title')}>
        <p>{t('s7.text')}</p>
      </LegalSection>

      <LegalSection title={t('s8.title')}>
        <p>{t('s8.text')}</p>
      </LegalSection>

      <LegalSection title={t('s9.title')}>
        <p>{t('s9.text')}</p>
      </LegalSection>

      <LegalSection title={t('s10.title')}>
        <p>
          {t.rich('s10.text', {
            deletion: (chunks) => <Link href={localePath(locale, '/data-deletion') as Route}>{chunks}</Link>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('s11.title')}>
        <p>{t('s11.text', { company: company.legalName })}</p>
      </LegalSection>

      <LegalSection title={t('s12.title')}>
        <p>{t('s12.text')}</p>
      </LegalSection>

      <LegalSection title={t('s13.title')}>
        <p>
          {t.rich('s13.text', {
            mail: (chunks) => <a href={`mailto:${company.supportEmail}`}>{chunks}</a>,
            email: company.supportEmail,
          })}
        </p>
      </LegalSection>

      {locale === 'sr-Latn' ? (
        <>
          <hr />

          <LegalSection title="Terms of Service (English summary)">
            <LegalList
              items={[
                <>
                  These terms are an agreement between you and <strong>{company.legalName}</strong>, operator
                  of {company.productName}. By creating an account you accept them.
                </>,
                'Sova is a social media management tool with AI assistance. You decide what gets published and you are responsible for the content you publish, including copyright, accuracy and compliance with each network’s rules.',
                'By connecting a social account you authorise Sova to publish approved content on your behalf, import your past posts and read metrics. You can revoke this at any time.',
                'AI-generated content may be inaccurate; review it before publishing.',
                'AI actions consume tokens. Tokens are reserved before an action and charged only on success. Subscription tokens do not roll over; purchased top-up tokens do not expire. Subscriptions renew automatically until cancelled; cancellation takes effect at the end of the current period. Price changes are announced at least 30 days ahead.',
                'The service is provided “as is”. Our total liability is limited to the amount you paid us in the 12 months before the event giving rise to the claim, to the extent permitted by law.',
                'You may delete your account at any time. We may suspend accounts that breach these terms, network rules or the law.',
                <>
                  Governing law is the law of the jurisdiction where {company.legalName} is registered,
                  without prejudice to mandatory consumer and data protection rules in your country.
                </>,
              ]}
            />
          </LegalSection>
        </>
      ) : null}
    </LegalPage>
  )
}
