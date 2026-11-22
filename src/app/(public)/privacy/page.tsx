import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { localePath } from '@/i18n/paths'
import { publicMetadata, siteUrl } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('legal.privacy')])
  return publicMetadata({ locale, path: '/privacy', title: t('title'), description: t('metaDescription') })
}

const DATA = ['account', 'brand', 'social', 'inbox', 'content', 'payment', 'technical', 'team'] as const
const PURPOSES = ['service', 'security', 'billing', 'emails', 'analytics'] as const
/** samo servisi koji u produkciji zaista rade (22.11.2026: Netlify umesto Vercel-a; bez Upstash-a, Sentry-ja, PostHog-a i Turnstile-a) */
const PROCESSORS = [
  'supabase',
  'netlify',
  'gemini',
  'resend',
  'inngest',
  'stripe',
  'stock',
  'design',
] as const
const RETENTION = ['account', 'tokens', 'imported', 'inbox', 'support', 'logs', 'invoices'] as const

const external = (href: string) =>
  function ExternalLink(chunks: ReactNode) {
    return (
      <a href={href} rel="noreferrer" target="_blank">
        {chunks}
      </a>
    )
  }

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>

/**
 * Politika privatnosti na jeziku strane (D-130). Srpska strana ima i kratak sažetak na engleskom
 * (za recenzente mreža); engleska strana ima ceo tekst na engleskom.
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
            // adresa na kojoj Sova stvarno radi (pravi domen kad proradi), ne planirani domen
            domain: new URL(siteUrl()).host,
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
            policy: external('https://developers.google.com/terms/api-services-user-data-policy'),
          })}
        </p>
        <p>
          {t.rich('s4.p3', {
            yt: external('https://www.youtube.com/t/terms'),
            gpp: external('https://policies.google.com/privacy'),
            revoke: external('https://security.google.com/settings/security/permissions'),
          })}
        </p>
        <p>{t.rich('s4.p4', { deletion })}</p>
        <p>{t('s4.p5')}</p>
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
        <p>{t.rich('s10.text', { mail, email: company.privacyEmail })}</p>
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
              <strong>{company.legalName}</strong> operates {company.productName} ({new URL(siteUrl()).host}).
              Contact for privacy matters:{' '}
              <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>.
            </p>
            <LegalList
              items={[
                <>
                  <strong>Data we process:</strong> account data (name, email, hashed password, preferences);
                  brand data (your website URL and its public content); data from social accounts you connect
                  (account IDs and names, access tokens, your past posts and public metrics, metrics of posts
                  published by Sova); Inbox comments, messages and reviews when you turn Inbox on; content you
                  create in Sova and questions to the support chatbot; billing identifiers (card details stay
                  with Stripe); technical logs; team members&apos; and clients&apos; emails and approval
                  decisions.
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
                  User Data Policy, including the Limited Use requirements. Sova uses YouTube API Services; by
                  connecting a channel you agree to the{' '}
                  <a href="https://www.youtube.com/t/terms" rel="noreferrer" target="_blank">
                    YouTube Terms of Service
                  </a>{' '}
                  and the{' '}
                  <a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">
                    Google Privacy Policy
                  </a>{' '}
                  applies; you can revoke access on the{' '}
                  <a
                    href="https://security.google.com/settings/security/permissions"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Google security settings page
                  </a>
                  . TikTok and LinkedIn posts go out only after you approve each one.
                </>,
                <>
                  <strong>Processors:</strong> Supabase (EU), Netlify, Google Gemini API, Resend, Inngest,
                  Stripe (when online payment is enabled), Unsplash and Pexels (search queries only), Canva
                  and Figma (only when you connect them). Transfers to the US rely on Standard Contractual
                  Clauses or the EU-US Data Privacy Framework.
                </>,
                <>
                  <strong>AI:</strong> your website content, brand description, inputs, gallery photos,
                  imported posts, Inbox messages (when you ask for a suggested reply) and support chatbot
                  questions are sent to the Google Gemini API. Unsplash and Pexels photos are not sent, and
                  people&apos;s appearance or origin is never assessed. Paid Gemini API data is not used to
                  train Google&apos;s models. Sova does not create AI photos.
                </>,
                <>
                  <strong>Retention:</strong> account and brand data while the account exists plus up to 30
                  days; tokens until disconnection; YouTube and Google Business Profile data up to 30 days
                  from the last refresh; Inbox up to 12 months from the last message; support chatbot 90 days;
                  logs up to 90 days; invoices as required by law.
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
