import { faCheck } from '@fortawesome/free-solid-svg-icons'
import Link from 'next/link'

import { cn } from 'cn'

import { UrlForm } from './demo-context'
import { HeroDemo } from './hero-demo'
import { Fa } from './icons'
import { PlatformTile } from './platform-tile'
import { LANDING_PLATFORMS } from './platforms'

/**
 * Pilula iznad naslova prati flag `registration_open` (admin): zatvoreno je tekst iz dizajna
 * („U izradi · Registracija stiže uskoro”), otvoreno vodi na registraciju.
 */
function StatusPill({ open }: { open: boolean }) {
  return (
    <Link
      href={open ? '/register' : '#cene'}
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
        {open ? 'Otvoreno' : 'U izradi'}
      </span>
      <span>{open ? 'Registracija je otvorena' : 'Registracija stiže uskoro'}</span>
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
  return (
    <section id="top" className="relative px-6 pt-[72px] pb-[110px]">
      <div aria-hidden className="l-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="l-grid-56 pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-[1200px] flex-wrap items-center gap-14">
        <div className="min-w-0 flex-[1_1_420px]">
          <StatusPill open={registrationOpen} />
          <h1 className="mt-6 text-[clamp(44px,5.6vw,72px)] leading-[0.98] font-semibold tracking-[-0.045em]">
            Unesite sajt,
            <br />
            <span className="text-l-accent">Sova vodi</span>
            <br />
            vaše mreže.
          </h1>
          <p className="mt-6 max-w-[500px] text-lg leading-[1.55] text-pretty text-l-muted">
            Sova nauči vaš brend sa sajta, napravi strategiju, piše objave, pravi vizuale, zakazuje i
            objavljuje, pa uči iz rezultata.
          </p>
          <UrlForm variant="hero" />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-l-muted">
            {[
              freeTokens ? `${freeTokens} besplatnih tokena` : 'Besplatna proba',
              'Bez kartice',
              'Srpski, latinica i ćirilica',
            ].map((t) => (
              <span key={t} className="flex items-center gap-[7px]">
                <Fa icon={faCheck} className="text-l-accent" style={{ fontSize: 11 }} />
                {t}
              </span>
            ))}
          </div>
          <div className="mt-11 flex flex-wrap items-center gap-3.5">
            <span className="text-[12.5px] text-l-dim">Objavljuje na</span>
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
