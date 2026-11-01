import { faCheck } from '@fortawesome/free-solid-svg-icons'
import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { localePath, SECTION_IDS } from '@/i18n/paths'
import { cn } from 'cn'

import { UrlForm } from './demo-context'
import { HeroDemo } from './hero-demo'
import { Fa } from './icons'
import { PlatformTile } from './platform-tile'
import { LANDING_PLATFORMS } from './platforms'

/**
 * Pilula iznad naslova prati flag `registration_open` (admin): zatvoreno je tekst iz dizajna
 * („U izradi · Registracija stiže uskoro”), otvoreno vodi na registraciju na jeziku strane (D-130).
 */
function StatusPill({ open }: { open: boolean }) {
  const t = useTranslations('site.hero.pill')
  const locale = useLocale()
  const href = (open ? localePath(locale, '/register') : `#${SECTION_IDS[locale].pricing}`) as Route
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 rounded-full border border-l-line/18 bg-[rgba(11,17,30,0.6)] py-[5px] pr-3 pl-[5px] text-[13px] text-l-text-2 transition-colors hover:border-l-line/30 hover:text-white"
    >
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-full px-[9px] py-[3px] text-[11.5px] font-semibold',
          open ? 'bg-l-accent/14 text-l-accent' : 'bg-l-warning/14 text-l-warning',
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full motion-safe:animate-l-pulse',
            open ? 'bg-l-accent' : 'bg-l-warning',
          )}
        />
        {open ? t('open') : t('closed')}
      </span>
      <span>{open ? t('openText') : t('closedText')}</span>
    </Link>
  )
}

export function Hero({
  registrationOpen,
  freeTokens,
}: {
  registrationOpen: boolean
  freeTokens: number | null
}) {
  const t = useTranslations('site.hero')
  return (
    <section id="top" className="relative px-6 pt-[72px] pb-[110px]">
      <div aria-hidden className="l-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="l-grid-56 pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-[1200px] flex-wrap items-center gap-14">
        <div className="min-w-0 flex-[1_1_420px]">
          <StatusPill open={registrationOpen} />
          <h1 className="mt-6 text-[clamp(44px,5.6vw,72px)] leading-[0.98] font-semibold tracking-[-0.045em]">
            {t('title1')}
            <br />
            <span className="text-l-accent">{t('title2')}</span>
            <br />
            {t('title3')}
          </h1>
          <p className="mt-6 max-w-[500px] text-lg leading-[1.55] text-pretty text-l-muted">{t('sub')}</p>
          <UrlForm variant="hero" />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-l-muted">
            {[
              freeTokens ? t('freeTokens', { count: freeTokens }) : t('freeTrial'),
              t('noCard'),
              t('languages'),
            ].map((item) => (
              <span key={item} className="flex items-center gap-[7px]">
                <Fa icon={faCheck} className="text-l-accent" style={{ fontSize: 11 }} />
                {item}
              </span>
            ))}
          </div>
          <div className="mt-11 flex flex-wrap items-center gap-3.5">
            <span className="text-[12.5px] text-l-dim">{t('publishesTo')}</span>
            <div className="flex flex-wrap gap-1.5">
              {LANDING_PLATFORMS.map((p) => (
                <PlatformTile key={p.key} p={p} size={28} radius={8} glyph={13} />
              ))}
            </div>
          </div>
        </div>
        <HeroDemo />
      </div>
    </section>
  )
}
