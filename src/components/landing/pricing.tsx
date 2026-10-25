'use client'

import { faArrowTrendDown, faCheck, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import type { Route } from 'next'
import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { cn } from 'cn'

import { Switch } from './feature-demos'
import { Fa } from './icons'
import { plural, recommendPlan, tokensNeeded, type PricingData, type Recommendation } from './pricing-math'

/** Planovi, kalkulator tokena i dopune (D-098); preporuka iz kalkulatora boji kartice planova. */
const num = new Intl.NumberFormat('sr-Latn-RS')
const tokenWord = (n: number) => plural(n, 'token', 'tokena', 'tokena')
const brands = (n: number) => `${n} ${plural(n, 'brend', 'brenda', 'brendova')}`
const networks = (n: number) => `${n} ${plural(n, 'mreža', 'mreže', 'mreža')}`
const members = (n: number) => `${n} ${plural(n, 'član', 'člana', 'članova')}`

/** Celi iznosi bez decimala („39 US$”), ostali sa dve. */
function moneyFormatter(currency: string) {
  const whole = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency, maximumFractionDigits: 0 })
  const exact = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency, minimumFractionDigits: 2 })
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
  period,
  description,
  children,
  recommended,
  featured,
  href,
}: {
  name: string
  price: string
  period?: string
  description: string
  children: ReactNode
  recommended: boolean
  featured?: boolean
  href: Route
}) {
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
          Najčešći izbor
        </span>
      ) : null}
      <div className="flex min-h-6 items-center justify-between gap-2.5">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        {recommended ? (
          <span className="rounded-full bg-l-accent/14 px-[9px] py-[3px] text-[11.5px] font-medium text-l-accent-soft">
            Pokriva vaš obim
          </span>
        ) : null}
      </div>
      <div className="mt-[18px] flex items-baseline gap-2">
        <span className="text-[46px] leading-none font-semibold tracking-[-0.04em]">{price}</span>
        {period ? <span className="text-sm text-l-dim">{period}</span> : null}
      </div>
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
        Počnite
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

function recommendationText(rec: Recommendation, data: PricingData, money: (cents: number) => string) {
  if (rec.kind === 'free') {
    return { title: 'Besplatno je dovoljno', note: `${data.free.tokens} tokena za probu pokriva ovaj obim.` }
  }
  if (rec.kind === 'plan') {
    return {
      title: 'Mesečni ili Godišnji plan',
      note: `Ostaje vam ${num.format(rec.left)} ${tokenWord(rec.left)} mesečno za dodatne objave.`,
    }
  }
  const over = `${num.format(rec.excess)} ${tokenWord(rec.excess)} preko plana`
  if (!rec.topup) return { title: 'Plan + dopuna', note: `Potrebna vam je dopuna za ${over}.` }
  const label = `${rec.topup.parts.map((t) => num.format(t)).join(' + ')} tokena`
  return { title: 'Plan + dopuna', note: `Dodajte ${label} (${money(rec.topup.costCents)}) za ${over}.` }
}

export function Pricing({ data, registrationOpen }: { data: PricingData; registrationOpen: boolean }) {
  const [textPosts, setTextPosts] = useState(8)
  const [imagePosts, setImagePosts] = useState(16)
  const [strategy, setStrategy] = useState(true)
  const money = useMemo(() => moneyFormatter(data.currency), [data.currency])
  const { costs, free, monthly, yearly } = data
  const imagePostCost = costs.text + costs.image
  const tokens = tokensNeeded(costs, textPosts, imagePosts, strategy)
  const rec = recommendPlan(tokens, data)
  const { title, note } = recommendationText(rec, data, money)
  const href = (registrationOpen ? '/register' : '/#top') as Route
  // Godišnji po mesecu zaokružen na ceo iznos („Oko 17 US$”), ušteda u odnosu na 12 mesečnih
  const yearlyPerMonth = Math.round(yearly.priceCents / 12 / 100) * 100
  const saving = Math.round((1 - yearly.priceCents / (monthly.priceCents * 12)) * 100)

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <PlanCard
        name={free.name}
        price={money(0)}
        description={`${free.tokens} tokena za probu, ${brands(free.brands)} i ${networks(free.networks)}.`}
        recommended={rec.kind === 'free'}
        href={href}
      >
        <Check>{free.tokens} tokena jednom</Check>
        <Check>
          {brands(free.brands)}, {networks(free.networks)}
        </Check>
        <Check>Kalendar i objavljivanje</Check>
      </PlanCard>
      <PlanCard
        name={monthly.name}
        price={money(monthly.priceCents)}
        period="mesečno"
        description={`${monthly.tokens} tokena svakog meseca, do ${brands(monthly.brands)}, ${networks(monthly.networks)} i ${members(monthly.members)}.`}
        recommended={rec.kind !== 'free'}
        featured
        href={href}
      >
        <Check>{monthly.tokens} tokena svakog meseca</Check>
        <Check>
          Do {brands(monthly.brands)}, {networks(monthly.networks)}
        </Check>
        <Check>{members(monthly.members)} tima</Check>
      </PlanCard>
      <PlanCard
        name={yearly.name}
        price={money(yearly.priceCents)}
        period="godišnje"
        description={`${yearly.tokensPerMonth} tokena svakog meseca, plaćeno za godinu unapred.`}
        recommended={rec.kind !== 'free'}
        href={href}
      >
        <Check>Sve iz Mesečnog plana</Check>
        <Check>Oko {money(yearlyPerMonth)} mesečno</Check>
        {saving > 0 ? <Check accent>{saving} % manje nego mesečni plan</Check> : null}
      </PlanCard>

      <div className="min-w-0 flex-[1.6_1_520px] rounded-[20px] border border-l-line/12 bg-l-card p-7">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Koliko tokena vam treba?</h3>
        <p className="mt-1 text-[13.5px] text-l-muted">Pomerite klizače, preporuka plana se ažurira.</p>
        <div className="mt-[26px] flex flex-wrap gap-7">
          <div className="flex min-w-0 flex-[1.4_1_260px] flex-col gap-6">
            <Range
              label="Objave samo sa tekstom"
              value={textPosts}
              onChange={setTextPosts}
              hint={`${textPosts} × ${costs.text} ${tokenWord(costs.text)}`}
            />
            <Range
              label="Objave sa slikom"
              value={imagePosts}
              onChange={setImagePosts}
              hint={`${imagePosts} × ${imagePostCost} ${tokenWord(imagePostCost)}`}
              note={`Tekst ${costs.text} ${tokenWord(costs.text)} + slika ${costs.image} ${tokenWord(costs.image)}`}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-l-text-2">Mesečna strategija</div>
                <div className="mt-0.5 text-xs text-l-dim">
                  {costs.strategy} {tokenWord(costs.strategy)}
                </div>
              </div>
              <Switch on={strategy} onChange={setStrategy} label="Mesečna strategija" />
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col rounded-2xl border border-l-line/12 bg-l-inner p-[22px]">
            <div className="font-l-mono text-[10.5px] tracking-[0.08em] text-l-dim">MESEČNO VAM TREBA</div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-5xl leading-none font-semibold tracking-[-0.04em]">
                {num.format(tokens)}
              </span>
              <span className="text-sm text-l-muted">{tokenWord(tokens)}</span>
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
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Dopune koje ne ističu</h3>
        <p className="mt-1 text-[13.5px] text-l-muted">Kupite samo kad vam zatreba.</p>
        <ul className="mt-[18px] flex flex-col">
          {data.topups.map((t, i) => (
            <li
              key={t.tokens}
              className={cn(
                'flex items-center justify-between py-3.5 text-[14.5px]',
                i < data.topups.length - 1 && 'border-b border-l-line/10',
              )}
            >
              <span className="text-l-text-2">{num.format(t.tokens)} tokena</span>
              <span className="font-semibold">{money(t.priceCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-2 pt-4 text-[12.5px] leading-normal text-l-dim">
          <Fa icon={faCircleInfo} className="mt-0.5" style={{ fontSize: 12 }} />
          <span>
            Objavljivanje, kalendar i analitika ne troše tokene, osim objava na X ({costs.xPost}{' '}
            {tokenWord(costs.xPost)}, sa linkom {costs.xPostWithLink}).
          </span>
        </div>
      </div>
    </div>
  )
}
