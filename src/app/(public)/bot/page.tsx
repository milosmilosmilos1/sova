import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { company } from '@/config/company'
import { publicMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('botPage')])
  return publicMetadata({ locale, path: '/bot', title: 'SovaBot', description: t('metaDescription') })
}

const BEHAVIOUR = ['robots', 'pages', 'sitemap', 'forms'] as const

/** Javna strana na koju pokazuje User-Agent crawlera (BOT_INFO_URL), na jeziku strane (D-130). */
export default async function BotPage() {
  const t = await getTranslations('botPage')
  return (
    <LegalPage title="SovaBot" titleEn="SovaBot crawler">
      <LegalSection title={t('what.title')}>
        <p>{t('what.text', { company: company.legalName })}</p>
      </LegalSection>
      <LegalSection title={t('behaviour.title')}>
        <ul className="list-disc space-y-1 pl-5">
          {BEHAVIOUR.map((key) => (
            <li key={key}>{t(`behaviour.items.${key}`)}</li>
          ))}
          <li>User-Agent: SovaBot/1.0 (+https://sovaai.rs/bot)</li>
        </ul>
      </LegalSection>
      <LegalSection title={t('block.title')}>
        <p>{t('block.add')}</p>
        <pre className="rounded-md bg-muted p-3 text-sm">{`User-agent: SovaBot\nDisallow: /`}</pre>
        <p>{t('block.text', { email: company.privacyEmail })}</p>
      </LegalSection>
    </LegalPage>
  )
}
