'use client'

import { faInstagram } from '@fortawesome/free-brands-svg-icons'
import { faClock, faLightbulb } from '@fortawesome/free-regular-svg-icons'
import {
  faCheck,
  faChevronDown,
  faCircleNotch,
  faEarthEurope,
  faLock,
} from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useState, useSyncExternalStore, type ReactNode } from 'react'

import { cn } from 'cn'

import { useDemo } from './demo-context'
import { Fa } from './icons'
import { PlatformTile } from './platform-tile'
import { byKey } from './platforms'

/**
 * Demo rada Sove u hero delu (D-098): šest koraka sa automatskim napredovanjem. Traka ispod
 * aktivnog koraka se puni za `stepSeconds`, a njen `animationend` prelazi na sledeći korak, pa
 * traka i promena koraka ne mogu da se raziđu. Prelaz mišem ili fokus u prozoru pauzira; klik na
 * korak skače na njega. Uz smanjeno kretanje nema automatskog napredovanja. Primer brenda je na
 * jeziku strane (D-130).
 */
const STEPS = ['site', 'brain', 'strategy', 'posts', 'publish', 'results'] as const
const STEP_SECONDS = 4.5

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(reducedMotionQuery)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  )

const mono = 'font-l-mono'
const label = `${mono} text-[11px] tracking-[0.08em] text-l-accent`
const small = `${mono} text-[10.5px] tracking-[0.08em] text-l-dim`

function PanelHead({ title, meta, tight }: { title: string; meta: string; tight?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', tight ? 'mb-1.5' : 'mb-3.5')}>
      <span className={label}>{title}</span>
      <span className="text-xs text-l-dim">{meta}</span>
    </div>
  )
}

function Chip({ children, outline }: { children: ReactNode; outline?: boolean }) {
  return (
    <span
      className={cn(
        'px-[9px] py-1 text-xs text-l-text-2',
        outline ? 'rounded-md border border-l-line/16' : 'rounded-full bg-l-chip',
      )}
    >
      {children}
    </span>
  )
}

function SitePanel({ domain }: { domain: string }) {
  const t = useTranslations('site.heroDemo.site')
  const demo = useTranslations('site.demo')
  const pages: Array<['home' | 'offer' | 'about' | 'contact' | 'blog', boolean]> = [
    ['home', true],
    ['offer', true],
    ['about', true],
    ['contact', true],
    ['blog', false],
  ]
  return (
    <>
      <PanelHead title={t('title')} meta={t('meta')} />
      <div className="overflow-hidden rounded-xl border border-l-line/14 bg-l-inner">
        <div className="flex items-center gap-2 border-b border-l-line/10 px-3 py-[9px] text-xs text-l-muted">
          <Fa icon={faLock} className="text-l-success" style={{ fontSize: 10 }} />
          <span className="truncate">https://{domain}</span>
        </div>
        <div className="relative h-[150px] overflow-hidden bg-l-img">
          <Image
            src="/landing/peciva.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 420px, 90vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,19,0.1)_30%,rgba(6,10,19,0.75))]" />
          <div className="absolute bottom-3 left-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white">
            {demo('headline')}
          </div>
          <div className="absolute inset-x-0 top-0 h-[30%] border-b border-l-accent bg-[linear-gradient(180deg,transparent,rgba(61,169,252,0.32))] motion-safe:animate-l-scan motion-reduce:hidden" />
        </div>
      </div>
      <div className="mt-3 flex flex-col">
        {pages.map(([page, done], i) => (
          <div
            key={page}
            className={cn(
              'flex items-center justify-between px-0.5 py-[9px] text-[13px]',
              i < pages.length - 1 && 'border-b border-l-line/8',
            )}
          >
            <span className="text-l-text-2">{t(`pages.${page}`)}</span>
            {done ? (
              <span className="flex items-center gap-1.5 text-[11.5px] text-l-success">
                <Fa icon={faCheck} />
                {t('done')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11.5px] text-l-accent">
                {/* pulsira samo ikona, tekst ostaje čitljiv (kontrast) */}
                <Fa icon={faCircleNotch} className="motion-safe:animate-l-pulse-fast" />
                {t('reading')}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function BrandPanel() {
  const t = useTranslations('site.heroDemo.brand')
  const demo = useTranslations('site.demo')
  return (
    <>
      <PanelHead title={t('title')} meta={t('meta')} />
      <div className="flex items-center gap-3 border-b border-l-line/10 pb-4">
        <Image
          src="/landing/hleb.jpg"
          alt=""
          width={46}
          height={46}
          className="size-[46px] rounded-xl bg-l-img object-cover"
        />
        <div>
          <div className="text-[15.5px] font-semibold">{demo('brand')}</div>
          <div className="mt-0.5 text-[12.5px] text-l-muted">{t('place')}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className={cn(small, 'mb-2')}>{t('colours')}</div>
          <div className="flex gap-1.5">
            {['#3B2416', '#C98B4B', '#F3E6D3', '#6E7F4F'].map((c, i) => (
              <span
                key={c}
                className="size-[26px] rounded-[7px]"
                style={{
                  background: c,
                  boxShadow: i === 0 ? 'inset 0 0 0 1px rgba(255,255,255,0.14)' : undefined,
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className={cn(small, 'mb-2')}>{t('tone')}</div>
          <div className="flex flex-wrap gap-[5px]">
            <Chip>{demo('tones.warm')}</Chip>
            <Chip>{demo('tones.local')}</Chip>
            <Chip>{demo('tones.plain')}</Chip>
          </div>
        </div>
        <div className="col-span-2">
          <div className={cn(small, 'mb-1.5')}>{t('audience')}</div>
          <div className="text-[13.5px] leading-normal text-l-text-2">{t('audienceText')}</div>
        </div>
        <div className="col-span-2">
          <div className={cn(small, 'mb-2')}>{t('services')}</div>
          <div className="flex flex-wrap gap-[5px]">
            <Chip outline>{t('list.sourdough')}</Chip>
            <Chip outline>{t('list.croissants')}</Chip>
            <Chip outline>{t('list.cakes')}</Chip>
            <Chip outline>{t('list.catering')}</Chip>
          </div>
        </div>
      </div>
      <div className="mt-[18px] rounded-[10px] border border-l-accent/18 bg-l-accent/7 px-3 py-[11px] text-[12.5px] leading-[1.45] text-l-accent-pale">
        {t('note')}
      </div>
    </>
  )
}

function StrategyPanel() {
  const t = useTranslations('site.heroDemo.strategy')
  const pillars: Array<['products' | 'behind' | 'tips' | 'offers', number, string]> = [
    ['products', 40, '#3DA9FC'],
    ['behind', 25, '#9B8CFF'],
    ['tips', 20, '#45D19A'],
    ['offers', 15, '#F2B552'],
  ]
  return (
    <>
      <PanelHead title={t('title')} meta={t('meta')} />
      <div className="text-[22px] font-semibold tracking-[-0.025em]">{t('headline')}</div>
      <div className="mt-1.5 text-[13.5px] leading-normal text-l-muted">{t('goal')}</div>
      <div className="mt-5 flex flex-col gap-[13px]">
        {pillars.map(([pillar, pct, color]) => (
          <div key={pillar}>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-l-text-2">{t(`pillars.${pillar}`)}</span>
              <span className={cn(mono, 'text-[11.5px] text-l-muted')}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-[3px] bg-l-chip">
              <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
      <div className={cn(small, 'mt-[22px]')}>{t('rhythm')}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['mon', 'wed', 'fri'] as const).map((slot) => (
          <span
            key={slot}
            className="flex items-center gap-1.5 rounded-lg border border-l-line/12 bg-l-inner px-2.5 py-1.5 text-[12.5px] text-l-text-2"
          >
            <Fa icon={faClock} className="text-l-dim" style={{ fontSize: 11 }} />
            {t(`slots.${slot}`)}
          </span>
        ))}
      </div>
    </>
  )
}

function PostsPanel() {
  const t = useTranslations('site.heroDemo.posts')
  const demo = useTranslations('site.demo')
  const thumbs: Array<[string, boolean]> = [
    ['/landing/hleb.jpg', true],
    ['/landing/testo.jpg', true],
    ['/landing/vitrina.jpg', false],
  ]
  return (
    <>
      <PanelHead title={t('title')} meta={t('meta')} />
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-white text-l-social-ink">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <Image
              src="/landing/hleb.jpg"
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full object-cover"
            />
            <span className="text-xs font-semibold">{demo('handle')}</span>
            <Fa icon={faInstagram} className="ml-auto" style={{ fontSize: 14, color: '#E1306C' }} />
          </div>
          <div className="relative h-[220px] bg-[#E5E7EB]">
            <Image
              src="/landing/kroasani.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 300px, 70vw"
              className="object-cover"
            />
          </div>
          <div className="px-2.5 pt-[9px] pb-[11px] text-[11.5px] leading-[1.45] text-[#1F2937]">
            <b>{demo('handle')}</b> {t('caption')} <span className="text-[#00376B]">{t('tags')}</span>
          </div>
        </div>
        <div className="flex w-[92px] flex-none flex-col gap-2">
          {thumbs.map(([src, ready]) => (
            <div key={src} className="relative flex-1 overflow-hidden rounded-[10px] bg-l-img">
              <Image src={src} alt="" fill sizes="92px" className="object-cover" />
              <span
                className={cn(
                  'absolute bottom-1.5 left-1.5 rounded-[5px] bg-[rgba(6,10,19,0.8)] px-1.5 py-0.5 text-[10px]',
                  ready ? 'text-l-success' : 'text-l-warning',
                )}
              >
                {ready ? t('ready') : t('draft')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const STATUS = {
  published: 'bg-l-success/12 text-l-success',
  scheduled: 'bg-l-accent/12 text-l-accent-soft',
  review: 'bg-l-warning/13 text-l-warning',
  draft: 'bg-l-line/10 text-l-muted',
} as const

type PublishRow = 'ig' | 'fb' | 'tiktok' | 'cakes' | 'hours' | 'why'

function PublishPanel() {
  const t = useTranslations('site.heroDemo')
  const demo = useTranslations('site.demo')
  const rows: Array<[PublishRow, Parameters<typeof byKey>[0], keyof typeof STATUS]> = [
    ['ig', 'instagram', 'published'],
    ['fb', 'facebook', 'published'],
    ['tiktok', 'tiktok', 'scheduled'],
    ['cakes', 'instagram', 'review'],
    ['hours', 'google_business', 'scheduled'],
    ['why', 'linkedin', 'draft'],
  ]
  // ista objava na Instagramu i Facebooku nosi naslov primera objave
  const title = (row: PublishRow) =>
    row === 'ig' || row === 'fb' ? demo('postTitle') : t(`publish.rows.${row}.title`)
  return (
    <>
      <PanelHead title={t('publish.title')} meta={demo('week')} tight />
      <div className="flex flex-col">
        {rows.map(([row, key, status], i) => (
          <div
            key={row}
            className={cn(
              'flex items-center gap-2.5 py-3',
              i < rows.length - 1 && 'border-b border-l-line/8',
            )}
          >
            <span className={cn(mono, 'w-16 flex-none text-[11px] text-l-dim')}>
              {t(`publish.rows.${row}.when`)}
            </span>
            <PlatformTile
              p={byKey(key)}
              size={24}
              radius={7}
              glyph={key === 'tiktok' ? 11 : 12}
              googleSize={12}
              shadowOffset={1}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">{title(row)}</span>
            <span className={cn('rounded-full px-2 py-[3px] text-[11px] whitespace-nowrap', STATUS[status])}>
              {t(`badges.${status}`)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-[7px] text-xs text-l-dim">
        <Fa icon={faEarthEurope} style={{ fontSize: 11 }} />
        {t('publish.timezone')}
      </div>
    </>
  )
}

function ResultsPanel() {
  const t = useTranslations('site.heroDemo.results')
  const stats: Array<[string, string, string]> = [
    [t('reach'), t('reachValue'), '+32%'],
    [t('engagement'), t('engagementValue'), t('engagementDelta')],
    [t('followers'), '+214', '+18%'],
  ]
  const bars = [34, 42, 38, 55, 49, 66, 72, 96]
  return (
    <>
      <PanelHead title={t('title')} meta={t('meta')} />
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([name, value, delta]) => (
          <div key={name} className="rounded-[10px] border border-l-line/10 bg-l-inner p-3">
            <div className="text-[11.5px] text-l-dim">{name}</div>
            <div className="mt-1 text-xl font-semibold tracking-[-0.02em]">{value}</div>
            <div className="mt-0.5 text-[11.5px] text-l-success">{delta}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-[120px] items-end gap-1.5 border-b border-l-line/12 pb-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 rounded-[4px_4px_2px_2px]',
              i === bars.length - 1 ? 'bg-l-accent' : 'bg-l-accent/25',
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className={cn(mono, 'mt-1.5 flex justify-between text-[10px] text-l-dim')}>
        <span>{t('from')}</span>
        <span>{t('to')}</span>
      </div>
      <div className="mt-3.5 flex gap-2.5 rounded-[10px] border border-l-accent/18 bg-l-accent/7 p-3 text-[12.5px] leading-[1.45] text-l-accent-pale">
        <Fa icon={faLightbulb} className="mt-0.5" style={{ fontSize: 13 }} />
        <span>{t('insight')}</span>
      </div>
    </>
  )
}

export function HeroDemo() {
  const t = useTranslations('site.heroDemo')
  const demo = useTranslations('site.demo')
  const { domain, run } = useDemo()
  const autoplay = !useReducedMotion()
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  // nova adresa iz forme: demo kreće od prvog koraka (podešavanje stanja pri promeni ulaza, bez efekta)
  const [seenRun, setSeenRun] = useState(run)
  if (run !== seenRun) {
    setSeenRun(run)
    setStep(0)
    setCycle((c) => c + 1)
    setPaused(false)
  }
  const go = (i: number) => {
    setStep(i)
    setCycle((c) => c + 1)
  }
  const next = () => go((step + 1) % STEPS.length)
  const status = !autoplay ? t('state.manual') : paused ? t('state.paused') : t('state.running')

  return (
    <div className="relative min-w-0 flex-[1.15_1_520px]">
      <div
        role="region"
        aria-label={t('region')}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false)
        }}
        className="overflow-hidden rounded-[18px] border border-l-line/16 bg-l-card shadow-[0_50px_100px_-40px_rgba(0,0,0,0.85),0_0_0_6px_rgba(148,170,210,0.03)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-l-line/10 bg-l-topbar px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/landing/hleb.jpg"
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-[7px] bg-l-img object-cover"
            />
            <span className="text-[13.5px] font-semibold">{demo('brand')}</span>
            <Fa icon={faChevronDown} className="text-l-dim" style={{ fontSize: 9 }} />
          </div>
          <div className="flex items-center gap-2 text-xs text-l-muted">
            <span
              className={cn('size-[7px] rounded-full', paused || !autoplay ? 'bg-l-warning' : 'bg-l-success')}
            />
            <span>{status}</span>
          </div>
        </div>
        <div className="flex flex-wrap">
          <div className="flex flex-[1_1_170px] flex-col gap-0.5 border-r border-l-line/8 bg-l-rail p-2.5">
            {STEPS.map((name, i) => {
              const active = i === step
              const done = i < step
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-[9px] px-3 py-[11px] text-left text-[13.5px] font-medium transition-[background-color,color] duration-[250ms]',
                    active ? 'bg-l-accent/12 text-l-text' : done ? 'text-l-text-2' : 'text-l-dim',
                  )}
                >
                  <span
                    className={cn(mono, 'w-[18px] text-[11px]', active ? 'text-l-accent' : 'text-l-faint')}
                  >
                    0{i + 1}
                  </span>
                  <span className="flex-1">{t(`steps.${name}`)}</span>
                  {done ? <Fa icon={faCheck} className="text-l-success" style={{ fontSize: 10 }} /> : null}
                  {active && autoplay ? (
                    <span
                      key={cycle}
                      onAnimationEnd={next}
                      className="absolute inset-x-3 bottom-1 h-0.5 origin-left animate-l-fill rounded-[1px] bg-l-accent"
                      style={{
                        animationDuration: `${STEP_SECONDS * 1000}ms`,
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="min-h-[440px] min-w-0 flex-[999_1_320px] p-5 pb-12 sm:pb-5">
            <div key={`${step}-${cycle}`} className="motion-safe:animate-l-in">
              {step === 0 ? <SitePanel domain={domain} /> : null}
              {step === 1 ? <BrandPanel /> : null}
              {step === 2 ? <StrategyPanel /> : null}
              {step === 3 ? <PostsPanel /> : null}
              {step === 4 ? <PublishPanel /> : null}
              {step === 5 ? <ResultsPanel /> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-[26px] left-2 flex items-center gap-2.5 rounded-[14px] border border-l-line/18 bg-[rgba(15,23,39,0.94)] py-2.5 pr-3.5 pl-2.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur-[10px] sm:-left-7">
        <Image
          src="/landing/osoba-jelena.jpg"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full bg-l-img object-cover"
        />
        <div>
          <div className="text-[13px] font-medium">{t('approval.title')}</div>
          <div className="mt-px text-[11.5px] text-l-dim">{t('approval.meta')}</div>
        </div>
        <span className="ml-1 flex size-[22px] items-center justify-center rounded-full bg-l-success">
          <Fa icon={faCheck} className="text-l-on-accent" style={{ fontSize: 10 }} />
        </span>
      </div>
    </div>
  )
}
