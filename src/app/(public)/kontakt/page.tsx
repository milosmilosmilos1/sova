import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { localePath } from '@/i18n/paths'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('contact')])
  return publicMetadata({ locale, path: '/kontakt', title: t('title'), description: t('metaDescription') })
}

/** Kontakt na jeziku strane (D-130). */
export default async function ContactPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('contact')])
  return (
    <LegalPage title={t('title')} titleEn="Contact" updated={false}>
      <LegalSection title={t('support.title')}>
        <p>
          {t.rich('support.text', {
            mail: (chunks) => <a href={`mailto:${company.supportEmail}`}>{chunks}</a>,
            email: company.supportEmail,
          })}
        </p>
      </LegalSection>
      <LegalSection title={t('privacy.title')}>
        <p>
          {t.rich('privacy.text', {
            mail: (chunks) => <a href={`mailto:${company.privacyEmail}`}>{chunks}</a>,
            email: company.privacyEmail,
            deletion: (chunks) => <Link href={localePath(locale, '/data-deletion') as Route}>{chunks}</Link>,
          })}
        </p>
      </LegalSection>
      <LegalSection title={t('company.title')}>
        <p>
          {t('company.text', { product: company.productName, company: company.legalName })}
          {company.address ? ` ${t('address', { address: company.address })}` : ''}
        </p>
      </LegalSection>
    </LegalPage>
  )
}
