import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

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
import { isFeatureEnabled } from '@/lib/flags'
import { siteUrl } from '@/lib/seo'
import { getTokenPrices } from '@/lib/tokens/prices'
import { listPlans, type PlanRow } from '@/services/plans'

/** Naslov, opis i kanonski URL početne (D-095); slika za deljenje je `opengraph-image.tsx`. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing')
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', url: '/', siteName: 'Sova', locale: 'sr_RS', title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/** Strukturirani podaci (schema.org): proizvod sa cenama iz tabele `plans` i vlasnik. */
function structuredData(description: string, plans: PlanRow[]) {
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
        url: `${base}/`,
        inLanguage: 'sr-Latn',
        description,
        publisher: { '@id': `${base}/#organization` },
        offers: [
          {
            '@type': 'Offer',
            name: 'Besplatno',
            price: '0',
            priceCurrency: (plans.find((p) => p.code === 'free')?.currency ?? 'EUR').toUpperCase(),
          },
          ...plans
            .filter((p) => p.kind === 'subscription' && p.price_cents > 0)
            .map((p) => ({
              '@type': 'Offer',
              name: p.name,
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
  const t = await getTranslations('landing')
  const [plans, prices, registrationOpen] = await Promise.all([
    listPlans().catch(() => []),
    getTokenPrices(),
    isFeatureEnabled('registration_open'),
  ])
  const costs: PricingCosts = {
    text: prices.text,
    image: prices.image_standard,
    strategy: prices.strategy,
    xPost: prices.x_post,
    xPostWithLink: prices.x_post_with_link,
  }
  const pricing = pricingFromPlans(plans, costs)
  const freeTokens = pricing?.free.tokens ?? null

  return (
    <DemoProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForScript(structuredData(t('metaDescription'), plans)) }}
      />
      <Hero registrationOpen={registrationOpen} freeTokens={freeTokens} />
      <Section id="mreze">
        <SectionHeading
          title="Jedan kalendar za sve mreže"
          sub="Napišete jednom, Sova prilagodi format, dužinu i ton svakoj mreži. Objavljuje kroz zvanične API-je, uz vaše odobrenje ili automatski. Izaberite mrežu i pogledajte."
          subWidth={600}
        />
        <PlatformShowcase />
      </Section>
      <Features />
      <HowItWorks />
      <Section id="cene" alt>
        <SectionHeading
          title={
            <>
              Jednostavne cene,
              <br />
              <Accent>plaćate rad, ne sedišta</Accent>
            </>
          }
          sub="Tokeni se troše kad AI nešto napravi. Kalendar i analitika ne koštaju ništa."
        />
        {pricing ? (
          <Pricing data={pricing} registrationOpen={registrationOpen} />
        ) : (
          <p className="text-[15px] text-l-muted">
            Cenovnik trenutno nije dostupan. Osvežite stranicu za nekoliko minuta.
          </p>
        )}
      </Section>
      <Faq costs={costs} />
      <FinalCta registrationOpen={registrationOpen} freeTokens={freeTokens} />
    </DemoProvider>
  )
}
