import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { localePath } from '@/i18n/paths'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.privacy')])
  return publicMetadata({ locale, path: '/privacy', title: t('title'), description: t('metaDescription') })
}

const DATA = ['account', 'brand', 'social', 'content', 'payment', 'technical', 'team'] as const
const PURPOSES = ['service', 'security', 'billing', 'emails', 'analytics'] as const
const PROCESSORS = [
  'supabase',
  'vercel',
  'gemini',
  'stripe',
  'resend',
  'upstash',
  'inngest',
  'sentry',
  'posthog',
  'turnstile',
  'media',
] as const
const RETENTION = ['account', 'tokens', 'logs', 'invoices'] as const

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>

/**
 * Politika privatnosti na jeziku strane (D-130). Srpska strana ima i kratak sažetak na engleskom
 * (za recenzente mreža); engleska i ukrajinska strana imaju ceo tekst na svom jeziku.
 */
export default async function PrivacyPage() {
  const [locale, t, tl] = await Promise.all([
    getLocale(),
    getTranslations('legal.privacy'),
    getTranslations('legal'),
  ])
  const mail = (chunks: ReactNode) => <a href={`mailto:${company.privacyEmail}`}>{chunks}</a>
  const deletion = (chunks: ReactNode) => (
    <Link href={localePath(locale, '/data-deletion') as Route}>{chunks}</Link>
  )
  return (
    <LegalPage title={t('title')} titleEn="Privacy Policy">
      <LegalSection title={t('s1.title')}>
        <p>
          {t.rich('s1.text', {
            b: strong,
            mail,
            company: company.legalName,
            product: company.productName,
            domain: company.domain,
            email: company.privacyEmail,
          })}
          {company.address ? ` ${tl('address', { address: company.address })}` : ''}
        </p>
      </LegalSection>

      <LegalSection title={t('s2.title')}>
        <LegalList items={DATA.map((key) => t.rich(`s2.items.${key}`, { b: strong }))} />
      </LegalSection>

      <LegalSection title={t('s3.title')}>
        <LegalList items={PURPOSES.map((key) => t(`s3.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s4.title')}>
        <p>{t('s4.p1')}</p>
        <p>
          {t.rich('s4.p2', {
            policy: (chunks) => (
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                rel="noreferrer"
                target="_blank"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('s5.title')}>
        <LegalList items={PROCESSORS.map((key) => t.rich(`s5.processors.${key}`, { b: strong }))} />
        <p>{t('s5.text')}</p>
      </LegalSection>

      <LegalSection title={t('s6.title')}>
        <p>{t('s6.text')}</p>
      </LegalSection>

      <LegalSection title={t('s7.title')}>
        <LegalList items={RETENTION.map((key) => t(`s7.items.${key}`))} />
      </LegalSection>

      <LegalSection title={t('s8.title')}>
        <p>{t.rich('s8.p1', { mail, email: company.privacyEmail })}</p>
        <p>{t.rich('s8.p2', { deletion })}</p>
      </LegalSection>

      <LegalSection title={t('s9.title')}>
        <p>{t('s9.text')}</p>
      </LegalSection>

      <LegalSection title={t('s10.title')}>
        <p>{t('s10.text')}</p>
      </LegalSection>

      <LegalSection title={t('s11.title')}>
        <p>{t('s11.text')}</p>
      </LegalSection>

      <LegalSection title={t('s12.title')}>
        <p>{t('s12.text')}</p>
      </LegalSection>

      {locale === 'sr-Latn' ? (
        <>
          <hr />

          <LegalSection title="Privacy Policy (English summary)">
            <p>
              <strong>{company.legalName}</strong> operates {company.productName} ({company.domain}). Contact
              for privacy matters: <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>.
            </p>
            <LegalList
              items={[
                <>
                  <strong>Data we process:</strong> account data (name, email, hashed password, preferences);
                  brand data (your website URL and its public content); data from social accounts you connect
                  (account IDs and names, access tokens, your past posts and public metrics, metrics of posts
                  published by Sova); content you create in Sova; billing identifiers (card details stay with
                  Stripe); technical logs; team members&apos; and clients&apos; emails and approval decisions.
                </>,
                <>
                  <strong>Purposes and legal bases:</strong> providing the service (contract), security and
                  abuse prevention (legitimate interest), billing (contract and legal obligation), product
                  analytics and non-essential cookies (consent).
                </>,
                <>
                  <strong>Third-party platform data:</strong> used only for the features you request
                  (publishing on your behalf, importing history, showing metrics). Never sold, never used for
                  advertising. Tokens are stored encrypted (AES-256-GCM) and deleted when you disconnect.
                  Sova&apos;s use of information received from Google APIs adheres to the Google API Services
                  User Data Policy, including the Limited Use requirements.
                </>,
                <>
                  <strong>Processors:</strong> Supabase, Vercel, Google Gemini API, Stripe, Resend, Upstash,
                  Inngest, Sentry, PostHog, Cloudflare Turnstile, Unsplash and Canva (only when you choose
                  them). Transfers to the US rely on Standard Contractual Clauses or the EU-US Data Privacy
                  Framework.
                </>,
                <>
                  <strong>AI:</strong> your website content, brand description, inputs and uploaded photos are
                  sent to the Google Gemini API to generate content. Paid Gemini API data is not used to train
                  Google&apos;s models. AI-generated visuals are labelled.
                </>,
                <>
                  <strong>Retention:</strong> account and brand data while the account exists plus up to 30
                  days; tokens until disconnection; logs up to 90 days; invoices as required by law.
                </>,
                <>
                  <strong>Your rights:</strong> access, rectification, erasure, restriction, portability,
                  objection and withdrawal of consent under the GDPR and the Serbian Personal Data Protection
                  Act. You can delete your account yourself; see{' '}
                  <Link href="/data-deletion">Data deletion</Link>.
                </>,
                <>
                  <strong>Children:</strong> the service is for business users aged 18 and over.
                </>,
              ]}
            />
          </LegalSection>
        </>
      ) : null}
    </LegalPage>
  )
}
