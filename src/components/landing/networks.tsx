'use client'

import {
  faArrowRight,
  faCommentDots,
  faHeart,
  faPhone,
  faShare,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { useState } from 'react'

import { cn } from 'cn'

import { Fa, GoogleG } from './icons'
import { PlatformTile } from './platform-tile'
import { LANDING_PLATFORMS, type LandingPlatform } from './platforms'

/** Izbor mreže i pregled iste objave prilagođene toj mreži (sekcija „Mreže”, D-098). */
const num = new Intl.NumberFormat('sr-Latn-RS')

function FeedCard({ p }: { p: LandingPlatform }) {
  return (
    <div className="flex w-full max-w-[380px] flex-col overflow-hidden rounded-2xl bg-white text-l-social-ink shadow-[0_30px_70px_-24px_rgba(0,0,0,0.8)]">
      <div className="order-0 flex items-center gap-2.5 px-4 py-3.5">
        <Image
          src="/landing/hleb.jpg"
          alt=""
          width={38}
          height={38}
          className="size-[38px] rounded-full bg-[#E5E7EB] object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Pekara Zrno</div>
          <div className="truncate text-[12.5px] text-l-social-meta">{p.handle}</div>
        </div>
        {p.icon ? <Fa icon={p.icon} style={{ fontSize: 19, color: p.brand }} /> : <GoogleG size={19} />}
      </div>
      <div
        className="text-sm leading-normal whitespace-pre-line"
        style={{
          order: p.captionAfter ? 3 : 1,
          padding: p.captionAfter ? '14px 16px 0' : '0 16px 12px',
          fontWeight: p.captionAfter ? 600 : 400,
        }}
      >
        {p.caption}
      </div>
      <div className="order-2" style={{ padding: p.imagePad ?? 0 }}>
        <div
          className="relative overflow-hidden bg-[#E5E7EB]"
          style={{ height: p.imageHeight ?? 240, borderRadius: p.imageRadius ?? 0 }}
        >
          <Image src={p.image} alt="" fill sizes="380px" className="object-cover" />
        </div>
      </div>
      {p.cta ? (
        <div className="order-4 flex px-4 pt-3.5">
          <span className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-full bg-[#1A73E8] text-sm font-medium text-white">
            <Fa icon={faPhone} style={{ fontSize: 12 }} />
            Pozovite
          </span>
        </div>
      ) : null}
      <div className="order-5 px-4 pt-3 pb-3.5 text-[12.5px] text-l-social-meta">{p.actions}</div>
    </div>
  )
}

function VideoCard({ p }: { p: LandingPlatform }) {
  return (
    <div className="relative h-[480px] w-[270px] overflow-hidden rounded-[20px] bg-black shadow-[0_30px_70px_-24px_rgba(0,0,0,0.8)]">
      <Image src={p.image} alt="" fill sizes="270px" className="object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0)_22%,rgba(0,0,0,0)_50%,rgba(0,0,0,0.8))]" />
      <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between text-white">
        <span className="text-[13px] font-semibold">{p.videoTop}</span>
        {p.icon ? <Fa icon={p.icon} style={{ fontSize: 16 }} /> : null}
      </div>
      <div className="absolute right-2.5 bottom-24 flex flex-col items-center gap-4 text-[11px] text-white">
        {(
          [
            [faHeart, '2,4 hilj.'],
            [faCommentDots, '118'],
            [faShare, 'Podeli'],
          ] as const
        ).map(([icon, text]) => (
          <span key={text} className="flex flex-col items-center gap-1">
            <Fa icon={icon} style={{ fontSize: 22 }} />
            {text}
          </span>
        ))}
      </div>
      <div className="absolute right-16 bottom-5 left-3.5 text-[13.5px] leading-[1.45] text-white">
        <div className="mb-1 font-semibold">{p.handle}</div>
        <div>{p.caption}</div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
        <div className="h-full w-[38%] bg-white" />
      </div>
    </div>
  )
}

export function PlatformShowcase() {
  const [index, setIndex] = useState(0)
  const p = LANDING_PLATFORMS[index]!
  const count = p.caption.length
  const pct = Math.max(1.5, Math.min(100, (count / p.limit) * 100))
  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2">
        {LANDING_PLATFORMS.map((item, i) => {
          const active = i === index
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={active}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3.5 rounded-[14px] border px-3.5 py-3 text-left transition-[border-color,background-color] duration-200',
                active
                  ? 'border-l-accent/55 bg-l-accent/8'
                  : 'border-l-line/12 bg-l-card hover:border-l-line/30',
              )}
            >
              <PlatformTile p={item} size={38} radius={10} glyph={18} />
              <span
                className={cn(
                  'min-w-0 flex-1 text-[15px] font-medium',
                  active ? 'text-l-text' : 'text-l-text-2',
                )}
              >
                {item.name}
              </span>
              <span className="font-l-mono text-[11.5px] whitespace-nowrap text-l-dim">{item.format}</span>
              <Fa
                icon={faArrowRight}
                className="text-l-accent transition-opacity duration-200"
                style={{ fontSize: 12, opacity: active ? 1 : 0 }}
              />
            </button>
          )
        })}
      </div>
      <div className="l-dots flex min-w-0 flex-[1.3_1_460px] flex-col gap-[22px] rounded-[22px] border border-l-line/12 bg-l-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <div className="font-l-mono text-[11px] tracking-[0.08em] text-l-accent">PREGLED OBJAVE</div>
            <div className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em]">
              Ista objava, prilagođena za {p.name}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[p.format, p.tags, 'Zvanični API'].map((chip) => (
              <span
                key={chip}
                className="rounded-lg border border-l-line/14 bg-l-inner px-2.5 py-[5px] text-xs text-l-text-2"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-h-[520px] flex-1 items-center justify-center">
          {p.layout === 'video' ? <VideoCard p={p} /> : <FeedCard p={p} />}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 text-[13.5px] leading-normal text-l-text-2">
            <Fa icon={faWandMagicSparkles} className="mt-[3px] text-l-accent" style={{ fontSize: 13 }} />
            <span>{p.note}</span>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-l-dim">
              <span>Dužina teksta</span>
              <span className="font-l-mono">
                {num.format(count)} / {num.format(p.limit)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-sm bg-l-chip">
              <div
                className="h-full rounded-sm bg-l-accent transition-[width] duration-[400ms] ease-out"
                style={{ width: `${pct.toFixed(1)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
