import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { Button } from '@/components/ui/button'

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const steps = [
    { title: t('step1Title'), text: t('step1Text') },
    { title: t('step2Title'), text: t('step2Text') },
    { title: t('step3Title'), text: t('step3Text') },
  ]
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <section className="flex flex-col items-start gap-6 py-20 sm:py-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {t('heroTitle')}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{t('heroText')}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" render={<Link href="/register" />}>
            {t('ctaPrimary')}
          </Button>
          <Button size="lg" variant="outline" render={<a href="#kako-radi" />}>
            {t('ctaSecondary')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('statusNote')}</p>
      </section>
      <section id="kako-radi" className="border-t py-16">
        <h2 className="text-2xl font-semibold tracking-tight">{t('stepsTitle')}</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border bg-card p-6">
              <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
