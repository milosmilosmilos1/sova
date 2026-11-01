import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { DemoProvider } from '@/components/landing/demo-context'
import { Faq } from '@/components/landing/faq'
import { Features } from '@/components/landing/features'
import { FinalCta } from '@/components/landing/final-cta'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { PlatformShowcase } from '@/components/landing/networks'
import { Pricing } from '@/components/landing/pricing'
import { pricingFromPlans, type PricingCosts } from '@/components/landing/pricing-math'
import { Accent, Section, SectionHeading } from '@/components/landing/section'
import { company } from '@/config/company'
import type { AppLocale } from '@/i18n/config'
import { localePath, SECTION_IDS } from '@/i18n/paths'
import { AI_IMAGES_FLAG, isFeatureEnabled } from '@/lib/flags'
import { publicMetadata, siteUrl } from '@/lib/seo'
import { getTokenPrices } from '@/lib/tokens/prices'
import { listPlans, type PlanRow } from '@/services/plans'

/**
 * Naslov, opis, kanonski URL i verzije na drugim jezicima (D-095, D-130); slika za deljenje je
 * `/og/<jezik>`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('landing')])
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    ...publicMetadata({ locale, path: '/', title, description, absoluteTitle: true }),
    twitter: { card: 'summary_large_image', title, description },
  }
}

/**
 * Strukturirani podaci (schema.org): proizvod sa cenama iz tabele `plans` i vlasnik. Opis, jezik,
 * adresa strane i nazivi planova su na jeziku strane (D-130).
 */
function structuredData(
  locale: AppLocale,
  description: string,
  plans: PlanRow[],
  planName: (code: string, fromDb?: string) => string,
) {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: company.productName,
        legalName: company.legalName,
        url: `${base}/`,
      },
      {
        '@type': 'SoftwareApplication',
        name: company.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: `${base}${localePath(locale, '/')}`,
        inLanguage: locale,
        description,
        publisher: { '@id': `${base}/#organization` },
        offers: [
          {
            '@type': 'Offer',
            name: planName('free'),
            price: '0',
            priceCurrency: (plans.find((p) => p.code === 'free')?.currency ?? 'EUR').toUpperCase(),
          },
          ...plans
            .filter((p) => p.kind === 'subscription' && p.price_cents > 0)
            .map((p) => ({
              '@type': 'Offer',
              name: planName(p.code, p.name),
              price: (p.price_cents / 100).toFixed(2),
              priceCurrency: p.currency.toUpperCase(),
            })),
        ],
      },
    ],
  }
}

/** JSON u `<script>`: `<` se piše kao escape, da tekst iz baze ne može da zatvori tag. */
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\' + 'u003c')

/** Landing po dizajnu iz Claude Design-a (D-098); cene i troškovi tokena dolaze iz baze. */
export default async function LandingPage() {
  const [t, tp, locale] = await Promise.all([
    getTranslations('landing'),
    getTranslations('site'),
    getLocale(),
  ])
  const ids = SECTION_IDS[locale]
  const [plans, prices, registrationOpen, aiImages] = await Promise.all([
    listPlans().catch(() => []),
    getTokenPrices(),
    isFeatureEnabled('registration_open'),
    isFeatureEnabled(AI_IMAGES_FLAG),
  ])
  const costs: PricingCosts = {
    text: prices.text,
    // bez AI slika (D-104) slika objave je vizual iz šablona ili uvoz iz Canve, oba po istoj ceni
    image: aiImages ? prices.image_standard : prices.visual_template,
    strategy: prices.strategy,
    xPost: prices.x_post,
    xPostWithLink: prices.x_post_with_link,
  }
  const pricing = pricingFromPlans(plans, costs)
  const freeTokens = pricing?.free.tokens ?? null
  // naziv plana u porukama (D-130); plan koji poruke ne poznaju zadržava naziv iz baze
  const planName = (code: string, fromDb?: string) =>
    code === 'free' || code === 'monthly' || code === 'yearly'
      ? tp(`pricing.plans.${code}`)
      : (fromDb ?? code)

  return (
    <DemoProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonForScript(structuredData(locale, t('metaDescription'), plans, planName)),
        }}
      />
      <Hero registrationOpen={registrationOpen} freeTokens={freeTokens} />
      <Section id={ids.networks}>
        <SectionHeading title={tp('networks.title')} sub={tp('networks.sub')} subWidth={600} />
        <PlatformShowcase />
      </Section>
      <Features />
      <HowItWorks />
      <Section id={ids.pricing} alt>
        <SectionHeading
          title={
            <>
              {tp('pricing.title')}
              <br />
              <Accent>{tp('pricing.titleAccent')}</Accent>
            </>
          }
          sub={tp('pricing.sub')}
        />
        {pricing ? (
          <Pricing data={pricing} registrationOpen={registrationOpen} />
        ) : (
          <p className="text-[15px] text-l-muted">{tp('pricing.unavailable')}</p>
        )}
      </Section>
      <Faq costs={costs} />
      <FinalCta registrationOpen={registrationOpen} freeTokens={freeTokens} />
    </DemoProvider>
  )
}
