'use client'

import { faPlus } from '@fortawesome/free-solid-svg-icons'
import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState, type ReactNode } from 'react'

import { localePath, SECTION_IDS } from '@/i18n/paths'
import { cn } from 'cn'

import { Fa } from './icons'
import type { PricingCosts } from './pricing-math'

/** Česta pitanja (D-098): jedno otvoreno u isto vreme, prvo otvoreno na početku. */
const link =
  'text-l-accent-soft underline decoration-l-accent-soft/40 underline-offset-2 hover:decoration-current'

const ITEMS = ['tokens', 'autopilot', 'cancel', 'data', 'language'] as const

export function Faq({ costs }: { costs: PricingCosts }) {
  const t = useTranslations('site.faq')
  const locale = useLocale()
  const [open, setOpen] = useState(0)
  const id = useId()
  const href = (path: string) => localePath(locale, path) as Route
  const answers: Record<(typeof ITEMS)[number], ReactNode> = {
    tokens: t('items.tokens.a', {
      text: costs.text,
      image: costs.image,
      strategy: costs.strategy,
      xPost: costs.xPost,
      withLink: costs.xPostWithLink,
    }),
    autopilot: t('items.autopilot.a'),
    cancel: t('items.cancel.a'),
    data: t.rich('items.data.a', {
      privacy: (chunks) => (
        <Link href={href('/privacy')} className={link}>
          {chunks}
        </Link>
      ),
      deletion: (chunks) => (
        <Link href={href('/data-deletion')} className={link}>
          {chunks}
        </Link>
      ),
    }),
    language: t('items.language.a'),
  }
  return (
    <section id={SECTION_IDS[locale].faq} className="px-6 py-[110px]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-12">
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em]">
            {t('title')}
          </h2>
          <p className="mt-4 max-w-[340px] text-[17px] leading-[1.55] text-pretty text-l-muted">
            {t.rich('intro', {
              link: (chunks) => (
                <Link href={href('/kontakt')} className={link}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <div className="min-w-0 flex-[2_1_520px] border-t border-l-line/12">
          {ITEMS.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item} className="border-b border-l-line/12">
                <h3>
                  <button
                    type="button"
                    id={`${id}-q${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-a${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-[22px] text-left text-[17px] font-medium tracking-[-0.01em] text-l-text"
                  >
                    <span>{t(`items.${item}.q`)}</span>
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
                    {answers[item]}
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
