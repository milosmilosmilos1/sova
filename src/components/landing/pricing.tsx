'use client'

import { faArrowTrendDown, faCheck, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import type { Route } from 'next'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, type ReactNode } from 'react'

import { INTL_UI } from '@/i18n/config'
import { localePath } from '@/i18n/paths'
import { cn } from 'cn'

import { Switch } from './feature-demos'
import { Fa } from './icons'
import {
  discountPercent,
  recommendPlan,
  tokensNeeded,
  type PricingData,
  type Recommendation,
} from './pricing-math'

/**
 * Planovi, kalkulator tokena i dopune (D-098); preporuka iz kalkulatora boji kartice planova.
 * Nazivi planova su iz poruka, a iznosi i brojevi u formatu jezika strane (D-130).
 */
type PricingT = ReturnType<typeof useTranslations<'site.pricing'>>

/**
 * Celi iznosi bez decimala („47 €”), ostali sa dve. Uži znak valute: ukrajinski bi inače pisao
 * „47 EUR”, a srpski i engleski ostaju isti.
 */
function moneyFormatter(locale: string, currency: string) {
  const base = { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } as const
  const whole = new Intl.NumberFormat(locale, { ...base, maximumFractionDigits: 0 })
  const exact = new Intl.NumberFormat(locale, { ...base, minimumFractionDigits: 2 })
  return (cents: number) => (cents % 100 === 0 ? whole : exact).format(cents / 100)
}

function Check({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', accent && 'text-l-accent-soft')}>
      <Fa
        icon={accent ? faArrowTrendDown : faCheck}
        className={cn('w-3', !accent && 'text-l-accent')}
        style={{ fontSize: 11 }}
      />
      {children}
    </span>
  )
}

function PlanCard({
  name,
  price,
  regularPrice,
  discount,
  period,
  description,
  children,
  recommended,
  featured,
  href,
}: {
  name: string
  price: string
  /** redovna cena, precrtana pored uvodne (D-106) */
  regularPrice?: string | null
  discount?: number | null
  period?: string
  description: string
  children: ReactNode
  recommended: boolean
  featured?: boolean
  href: Route
}) {
  const t = useTranslations('site.pricing')
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-[1_1_300px] flex-col rounded-[20px] border p-7 transition-[border-color,box-shadow] duration-300',
        featured ? 'bg-l-featured' : 'bg-l-card',
        recommended
          ? 'border-l-accent/60 shadow-[0_0_0_4px_rgba(61,169,252,0.08)]'
          : featured
            ? 'border-l-line/22'
            : 'border-l-line/12',
      )}
    >
      {featured ? (
        <span className="absolute -top-[11px] left-7 rounded-full bg-l-accent px-2.5 py-[3px] text-[11.5px] font-semibold text-l-on-accent">
          {t('popular')}
        </span>
      ) : null}
      <div className="flex min-h-6 items-center justify-between gap-2.5">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        {recommended ? (
          <span className="rounded-full bg-l-accent/14 px-[9px] py-[3px] text-[11.5px] font-medium text-l-accent-soft">
            {t('covers')}
          </span>
        ) : null}
      </div>
      <div className="mt-[18px] flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {regularPrice ? (
          <s className="text-[22px] leading-none font-medium text-l-dim decoration-2">
            <span className="sr-only">{t('regularPrice')} </span>
            {regularPrice}
          </s>
        ) : null}
        <span className="text-[46px] leading-none font-semibold tracking-[-0.04em]">
          {regularPrice ? <span className="sr-only">{t('introPrice')} </span> : null}
          {price}
        </span>
        {period ? <span className="text-sm text-l-dim">{period}</span> : null}
      </div>
      {regularPrice && discount ? (
        <p className="mt-2 text-[12.5px] font-medium text-l-accent-soft">
          {t('introDiscount', { discount })}
        </p>
      ) : null}
      <p className="mt-3.5 text-[14.5px] leading-[1.55] text-l-muted">{description}</p>
      <div className="mt-[22px] mb-[26px] flex flex-col gap-2.5 text-sm text-l-text-2">{children}</div>
      <Link
        href={href}
        className={cn(
          'mt-auto flex h-11 items-center justify-center rounded-[11px] text-[14.5px] transition-[border-color,background-color,color] duration-200',
          featured
            ? 'bg-l-accent font-semibold text-l-on-accent hover:bg-l-accent-hover'
            : 'border border-l-line/22 font-medium text-l-text hover:border-l-line/45 hover:bg-l-line/6 hover:text-white',
        )}
      >
        {t('start')}
      </Link>
    </div>
  )
}

function Range({
  label,
  value,
  onChange,
  hint,
  note,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  hint: string
  note?: string
}) {
  return (
    <label className="block">
      <span className="mb-2.5 flex justify-between gap-3 text-sm">
        <span className="text-l-text-2">{label}</span>
        <span className="font-l-mono text-[12.5px] whitespace-nowrap text-l-muted">{hint}</span>
      </span>
      <input
        type="range"
        min={0}
        max={60}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="m-0 w-full accent-l-accent"
      />
      {note ? <span className="mt-1.5 block text-xs text-l-dim">{note}</span> : null}
    </label>
  )
}

function recommendationText(
  t: PricingT,
  rec: Recommendation,
  data: PricingData,
  money: (cents: number) => string,
  num: Intl.NumberFormat,
) {
  if (rec.kind === 'free') {
    return { title: t('rec.freeTitle'), note: t('rec.freeNote', { count: data.free.tokens }) }
  }
  if (rec.kind === 'plan') {
    return { title: t('rec.planTitle'), note: t('rec.planNote', { count: rec.left }) }
  }
  const over = t('rec.over', { count: rec.excess })
  if (!rec.topup) return { title: t('rec.topupTitle'), note: t('rec.need', { over }) }
  const parts = rec.topup.parts.map((n) => num.format(n)).join(' + ')
  return {
    title: t('rec.topupTitle'),
    note: t('rec.add', { parts, price: money(rec.topup.costCents), over }),
  }
}

export function Pricing({ data, registrationOpen }: { data: PricingData; registrationOpen: boolean }) {
  const t = useTranslations('site.pricing')
  const locale = useLocale()
  const [textPosts, setTextPosts] = useState(8)
  const [imagePosts, setImagePosts] = useState(16)
  const [strategy, setStrategy] = useState(true)
  const money = useMemo(() => moneyFormatter(INTL_UI[locale], data.currency), [locale, data.currency])
  const num = useMemo(() => new Intl.NumberFormat(INTL_UI[locale]), [locale])
  const { costs, free, monthly, yearly } = data
  const imagePostCost = costs.text + costs.image
  const tokens = tokensNeeded(costs, textPosts, imagePosts, strategy)
  const rec = recommendPlan(tokens, data)
  const { title, note } = recommendationText(t, rec, data, money, num)
  const href = localePath(locale, registrationOpen ? '/register' : '/#top') as Route
  // Godišnji po mesecu zaokružen na ceo iznos („Oko 17 US$”), ušteda u odnosu na 12 mesečnih
  const yearlyPerMonth = Math.round(yearly.priceCents / 12 / 100) * 100
  const saving = Math.round((1 - yearly.priceCents / (monthly.priceCents * 12)) * 100)

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <PlanCard
        name={t('plans.free')}
        price={money(0)}
        description={t('free.description', {
          tokens: free.tokens,
          brands: free.brands,
          networks: free.networks,
        })}
        recommended={rec.kind === 'free'}
        href={href}
      >
        <Check>{t('free.tokens', { count: free.tokens })}</Check>
        <Check>{t('free.limits', { brands: free.brands, networks: free.networks })}</Check>
        <Check>{t('free.calendar')}</Check>
      </PlanCard>
      <PlanCard
        name={t('plans.monthly')}
        price={money(monthly.priceCents)}
        regularPrice={monthly.regularPriceCents ? money(monthly.regularPriceCents) : null}
        discount={discountPercent(monthly.priceCents, monthly.regularPriceCents)}
        period={t('perMonth')}
        description={t('monthly.description', {
          tokens: monthly.tokens,
          brands: monthly.brands,
          networks: monthly.networks,
          members: monthly.members,
        })}
        recommended={rec.kind !== 'free'}
        featured
        href={href}
      >
        <Check>{t('monthly.tokens', { count: monthly.tokens })}</Check>
        <Check>{t('monthly.limits', { brands: monthly.brands, networks: monthly.networks })}</Check>
        <Check>{t('monthly.members', { count: monthly.members })}</Check>
      </PlanCard>
      <PlanCard
        name={t('plans.yearly')}
        price={money(yearly.priceCents)}
        regularPrice={yearly.regularPriceCents ? money(yearly.regularPriceCents) : null}
        discount={discountPercent(yearly.priceCents, yearly.regularPriceCents)}
        period={t('perYear')}
        description={t('yearly.description', { count: yearly.tokensPerMonth })}
        recommended={rec.kind !== 'free'}
        href={href}
      >
        <Check>{t('yearly.everything')}</Check>
        <Check>{t('yearly.perMonth', { price: money(yearlyPerMonth) })}</Check>
        {saving > 0 ? <Check accent>{t('yearly.saving', { saving })}</Check> : null}
      </PlanCard>

      <div className="min-w-0 flex-[1.6_1_520px] rounded-[20px] border border-l-line/12 bg-l-card p-7">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{t('calc.title')}</h3>
        <p className="mt-1 text-[13.5px] text-l-muted">{t('calc.sub')}</p>
        <div className="mt-[26px] flex flex-wrap gap-7">
          <div className="flex min-w-0 flex-[1.4_1_260px] flex-col gap-6">
            <Range
              label={t('calc.textPosts')}
              value={textPosts}
              onChange={setTextPosts}
              hint={t('calc.hint', { posts: textPosts, cost: costs.text })}
            />
            <Range
              label={t('calc.imagePosts')}
              value={imagePosts}
              onChange={setImagePosts}
              hint={t('calc.hint', { posts: imagePosts, cost: imagePostCost })}
              note={t('calc.imageNote', { text: costs.text, image: costs.image })}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-l-text-2">{t('calc.strategy')}</div>
                <div className="mt-0.5 text-xs text-l-dim">{t('tokens', { count: costs.strategy })}</div>
              </div>
              <Switch on={strategy} onChange={setStrategy} label={t('calc.strategy')} />
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col rounded-2xl border border-l-line/12 bg-l-inner p-[22px]">
            <div className="font-l-mono text-[10.5px] tracking-[0.08em] text-l-dim">{t('calc.need')}</div>
            <div className="mt-2.5 flex items-baseline gap-2">
              {t.rich('calc.total', {
                count: tokens,
                n: (chunks) => (
                  <span className="text-5xl leading-none font-semibold tracking-[-0.04em]">{chunks}</span>
                ),
                w: (chunks) => <span className="text-sm text-l-muted">{chunks}</span>,
              })}
            </div>
            <div className="mt-5 mb-4 h-px bg-l-line/12" />
            <div aria-live="polite">
              <div className="text-[15px] font-semibold">{title}</div>
              <div className="mt-1.5 text-[13px] leading-normal text-l-muted">{note}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col rounded-[20px] border border-l-line/12 bg-l-card p-7">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{t('topups.title')}</h3>
        <p className="mt-1 text-[13.5px] text-l-muted">{t('topups.sub')}</p>
        <ul className="mt-[18px] flex flex-col">
          {data.topups.map((topup, i) => (
            <li
              key={topup.tokens}
              className={cn(
                'flex items-center justify-between py-3.5 text-[14.5px]',
                i < data.topups.length - 1 && 'border-b border-l-line/10',
              )}
            >
              <span className="text-l-text-2">{t('tokens', { count: topup.tokens })}</span>
              <span className="font-semibold">{money(topup.priceCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-2 pt-4 text-[12.5px] leading-normal text-l-dim">
          <Fa icon={faCircleInfo} className="mt-0.5" style={{ fontSize: 12 }} />
          <span>{t('topups.note', { xPost: costs.xPost, withLink: costs.xPostWithLink })}</span>
        </div>
      </div>
    </div>
  )
}
