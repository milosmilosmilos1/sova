'use client'

import { faPlus } from '@fortawesome/free-solid-svg-icons'
import Link from 'next/link'
import { useId, useState, type ReactNode } from 'react'

import { pluralSr } from '@/lib/plural'
import { cn } from 'cn'

import { Fa } from './icons'
import type { PricingCosts } from './pricing-math'

/** Česta pitanja (D-098): jedno otvoreno u isto vreme, prvo otvoreno na početku. */
const tokenWord = (n: number) => pluralSr(n, 'token', 'tokena', 'tokena')
const link =
  'text-l-accent-soft underline decoration-l-accent-soft/40 underline-offset-2 hover:decoration-current'

function items(costs: PricingCosts): Array<[string, ReactNode]> {
  return [
    [
      'Šta su tokeni?',
      `Tokeni su jedinica rada AI-ja. Tekst objave košta ${costs.text} ${tokenWord(costs.text)}, slika ${costs.image}, a mesečna strategija ${costs.strategy}. Objavljivanje, kalendar i analitika ne troše tokene, osim objava na X: ${costs.xPost} ${tokenWord(costs.xPost)}, a sa linkom ${costs.xPostWithLink}.`,
    ],
    [
      'Da li Sova objavljuje bez mene?',
      'Samo ako to želite. Podrazumevano svaka objava čeka vaše odobrenje. Kada uključite Autopilot, Sova objavljuje po planu, u okviru budžeta tokena i pravila koja ste postavili.',
    ],
    [
      'Mogu li da otkažem pretplatu?',
      'Da, u svakom trenutku, sa stranice Naplata u aplikaciji. Plan ostaje aktivan do kraja plaćenog perioda, a kupljene dopune tokena ne ističu.',
    ],
    [
      'Šta se dešava sa mojim podacima?',
      <>
        Podaci se koriste samo za rad na vašem brendu i ne prodajemo ih. Delimo ih samo sa obrađivačima iz{' '}
        <Link href="/privacy" className={link}>
          Politike privatnosti
        </Link>
        , kao što su hosting, AI i naplata. Nalog i sve podatke možete trajno obrisati sa stranice{' '}
        <Link href="/data-deletion" className={link}>
          Brisanje podataka
        </Link>
        .
      </>,
    ],
    [
      'Da li radi na srpskom?',
      'Da. Sova piše na srpskom, latinicom i ćirilicom, i na engleskom kada vam treba. Poštuje padeže, ton vašeg brenda i lokalne izraze.',
    ],
  ]
}

export function Faq({ costs }: { costs: PricingCosts }) {
  const [open, setOpen] = useState(0)
  const id = useId()
  return (
    <section id="pitanja" className="px-6 py-[110px]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-12">
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em]">
            Česta pitanja
          </h2>
          <p className="mt-4 max-w-[340px] text-[17px] leading-[1.55] text-pretty text-l-muted">
            Ako ne nađete odgovor, pišite nam preko stranice{' '}
            <Link href="/kontakt" className={link}>
              Kontakt
            </Link>
            .
          </p>
        </div>
        <div className="min-w-0 flex-[2_1_520px] border-t border-l-line/12">
          {items(costs).map(([q, a], i) => {
            const isOpen = open === i
            return (
              <div key={q} className="border-b border-l-line/12">
                <h3>
                  <button
                    type="button"
                    id={`${id}-q${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-a${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-[22px] text-left text-[17px] font-medium tracking-[-0.01em] text-l-text"
                  >
                    <span>{q}</span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-8 flex-none items-center justify-center rounded-full border transition-[transform,color,border-color] duration-[250ms]',
                        isOpen
                          ? 'rotate-45 border-l-accent/50 text-l-accent'
                          : 'border-l-line/20 text-l-muted',
                      )}
                    >
                      <Fa icon={faPlus} style={{ fontSize: 12 }} />
                    </span>
                  </button>
                </h3>
                <div id={`${id}-a${i}`} role="region" aria-labelledby={`${id}-q${i}`} hidden={!isOpen}>
                  <p className="-mt-1 mb-6 max-w-[640px] text-[15.5px] leading-[1.6] text-pretty text-l-muted motion-safe:animate-l-in-fast">
                    {a}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
