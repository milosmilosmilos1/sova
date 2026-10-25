import {
  ArrowRight,
  AtSign,
  Bot,
  Brain,
  BriefcaseBusiness,
  CalendarCheck,
  Camera,
  Check,
  CirclePlay,
  MapPin,
  Music,
  Pin,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { buttonVariants } from '@/components/ui/button'
import { company } from '@/config/company'
import { siteUrl } from '@/lib/seo'
import { getTokenPrices } from '@/lib/tokens/prices'
import { listPlans, type PlanRow } from '@/services/plans'
import { cn } from 'cn'

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
          { '@type': 'Offer', name: 'Besplatno', price: '0', priceCurrency: 'USD' },
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

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  )

/** Dijagram toka (kao V-dijagram reference): koraci kao kosi čipovi, aktivni korak sa plavim sjajem. */
function Pipeline({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      <div className="absolute top-6 bottom-6 left-[36%] w-px bg-linear-to-b from-transparent via-border to-transparent" />
      <ol className="relative grid gap-3">
        {steps.map((s, i) => (
          <li
            key={s}
            style={{ marginLeft: `${[4, 18, 32, 22, 12, 26][i] ?? 0}%` }}
            className={cn(
              'w-[62%] -skew-x-12 rounded-md border px-4 py-3 text-sm backdrop-blur-sm transition',
              i === active
                ? 'ring-brand-glow border-transparent bg-accent/70 text-foreground'
                : 'border-border bg-card/50 text-muted-foreground',
            )}
          >
            <span className="flex skew-x-12 items-center justify-center gap-2">
              <span className="font-mono text-xs text-brand-2">0{i + 1}</span>
              {s}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SectionTitle({ lead, accent, text }: { lead: string; accent?: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {lead} {accent ? <span className="text-brand-gradient">{accent}</span> : null}
      </h2>
      {text ? <p className="mt-3 text-pretty text-muted-foreground">{text}</p> : null}
    </div>
  )
}

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const [plans, prices] = await Promise.all([listPlans().catch(() => []), getTokenPrices()])
  const monthly = plans.find((p) => p.code === 'monthly')
  const yearly = plans.find((p) => p.code === 'yearly')
  const topups = plans.filter((p) => p.kind === 'topup')

  const networks: Array<[string, LucideIcon]> = [
    ['Facebook', Users],
    ['Instagram', Camera],
    ['LinkedIn', BriefcaseBusiness],
    ['TikTok', Music],
    ['X', AtSign],
    ['YouTube Shorts', CirclePlay],
    ['Pinterest', Pin],
    [t('googleBusiness'), MapPin],
  ]
  const features: Array<[string, string, LucideIcon]> = [
    [t('f1Title'), t('f1Text'), Brain],
    [t('f2Title'), t('f2Text'), Sparkles],
    [t('f3Title'), t('f3Text'), CalendarCheck],
    [t('f4Title'), t('f4Text'), Bot],
    [t('f5Title'), t('f5Text'), TrendingUp],
    [t('f6Title'), t('f6Text'), UsersRound],
  ]
  const steps = [
    { title: t('step1Title'), text: t('step1Text') },
    { title: t('step2Title'), text: t('step2Text') },
    { title: t('step3Title'), text: t('step3Text') },
  ]
  const faq = [
    { q: t('q1'), a: t('a1') },
    { q: t('q2'), a: t('a2') },
    { q: t('q3'), a: t('a3') },
    { q: t('q4'), a: t('a4') },
    { q: t('q5'), a: t('a5') },
  ]

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForScript(structuredData(t('metaDescription'), plans)) }}
      />
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0" />
        <div aria-hidden className="bg-glow absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {t('heroTitleLead')} <span className="text-brand-gradient">{t('heroTitleAccent')}</span>{' '}
              {t('heroTitleTail')}
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t('heroText')}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 shadow-[0_0_32px_-8px_var(--glow)]')}
              >
                {t('ctaPrimary')} <ArrowRight />
              </Link>
              <Link
                href="/#kako-radi"
                className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-11 px-5')}
              >
                {t('ctaSecondary')}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{t('trust')}</p>
            <p className="text-xs text-muted-foreground/80">{t('statusNote')}</p>
          </div>
          <Pipeline
            active={2}
            steps={[
              t('diagramSite'),
              t('diagramBrand'),
              t('diagramStrategy'),
              t('diagramPosts'),
              t('diagramPublish'),
              t('diagramLearn'),
            ]}
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionTitle lead={t('networksTitle')} text={t('networksText')} />
        <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {networks.map(([name, Icon]) => (
            <li key={name} className="flex items-center gap-3 bg-card/60 px-4 py-5 text-sm">
              <span className="grid size-9 place-items-center rounded-lg border border-border bg-background text-brand-2">
                <Icon className="size-4" aria-hidden />
              </span>
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section id="funkcije" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <SectionTitle lead={t('featuresTitle')} accent={t('featuresTitleAccent')} />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, text, Icon]) => (
            <li
              key={title}
              className="rounded-xl border border-border bg-card/50 p-6 transition hover:border-brand/50"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="kako-radi" className="scroll-mt-20 border-y border-border/60 bg-card/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionTitle lead={t('stepsTitle')} />
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="relative rounded-xl border border-border bg-background/60 p-6">
                <span className="inline-flex items-center rounded-full border border-brand/40 px-2.5 py-0.5 font-mono text-xs text-brand-2">
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="cene" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
        <SectionTitle lead={t('pricingTitle')} accent={t('pricingTitleAccent')} text={t('pricingText')} />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card/50 p-6">
            <h3 className="font-medium">{t('planFree')}</h3>
            <p className="mt-3 text-3xl font-semibold">{money(0, 'USD')}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('planFreeText')}</p>
            <Link href="/register" className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 w-full')}>
              {t('choose')}
            </Link>
          </div>
          {monthly ? (
            <div className="ring-brand-glow relative rounded-xl border border-transparent bg-card/70 p-6">
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                {t('popular')}
              </span>
              <h3 className="font-medium">{monthly.name}</h3>
              <p className="mt-3 text-3xl font-semibold">
                {money(monthly.price_cents, monthly.currency)}{' '}
                <span className="text-sm font-normal text-muted-foreground">{t('perMonth')}</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {monthly.tokens_per_period} {t('planMonthlyText')}
              </p>
              <Link href="/register" className={cn(buttonVariants(), 'mt-6 w-full')}>
                {t('choose')}
              </Link>
            </div>
          ) : null}
          {yearly ? (
            <div className="rounded-xl border border-border bg-card/50 p-6">
              <h3 className="font-medium">{yearly.name}</h3>
              <p className="mt-3 text-3xl font-semibold">
                {money(yearly.price_cents, yearly.currency)}{' '}
                <span className="text-sm font-normal text-muted-foreground">{t('perYear')}</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {yearly.tokens_per_period} {t('planYearlyText')}
              </p>
              {monthly ? (
                <p className="mt-2 text-sm text-brand-2">
                  {t('yearlySaving', {
                    perMonth: money(Math.round(yearly.price_cents / 12), yearly.currency),
                    percent: Math.round((1 - yearly.price_cents / (monthly.price_cents * 12)) * 100),
                  })}
                </p>
              ) : null}
              <Link href="/register" className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 w-full')}>
                {t('choose')}
              </Link>
            </div>
          ) : null}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card/30 p-6 text-sm">
            <h3 className="font-medium">{t('topupsTitle')}</h3>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {topups.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <Check className="size-4 text-brand-2" aria-hidden />
                    {p.name}
                  </span>
                  <span className="text-foreground">{money(p.price_cents, p.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card/30 p-6 text-sm">
            <h3 className="font-medium">{t('costsTitle')}</h3>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {(
                [
                  [t('costText'), prices.text],
                  [t('costImage'), prices.image_standard],
                  [t('costStrategy'), prices.strategy],
                ] as const
              ).map(([label, n]) => (
                <li key={label} className="flex items-center justify-between gap-4">
                  <span>{label}</span>
                  <span className="text-foreground">
                    {n} {t('tokens')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="pitanja" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-16">
        <SectionTitle lead={t('faqTitle')} />
        <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card/40">
          {faq.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.q}
                <span className="text-brand-2 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-pretty text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border/60">
        <div aria-hidden className="bg-glow absolute inset-0" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t('ctaTitle')} <span className="text-brand-gradient">{t('ctaTitleAccent')}</span>
          </h2>
          <p className="max-w-xl text-pretty text-muted-foreground">{t('ctaText')}</p>
          <Link
            href="/register"
            className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-6 shadow-[0_0_32px_-8px_var(--glow)]')}
          >
            {t('ctaPrimary')} <ArrowRight />
          </Link>
        </div>
      </section>
    </div>
  )
}
