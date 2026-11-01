'use client'

import { faCheck, faThumbsUp } from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from 'cn'

import { Fa } from './icons'
import { PlatformTile } from './platform-tile'
import { LANDING_PLATFORMS } from './platforms'

/** Interaktivni delovi sekcije „Kako radi” (D-098): povezivanje mreža i odobravanje objave. */
export function ConnectDemo() {
  const t = useTranslations('site.how.connect')
  const tp = useTranslations('site.platforms')
  // podrazumevano povezani: Instagram, Facebook, LinkedIn i Google
  const [connected, setConnected] = useState(() =>
    LANDING_PLATFORMS.map((p) => ['instagram', 'facebook', 'linkedin', 'google_business'].includes(p.key)),
  )
  const count = connected.filter(Boolean).length
  return (
    <div className="flex h-full flex-col justify-center gap-3.5 p-6">
      <div className="grid grid-cols-4 justify-items-center gap-2.5">
        {LANDING_PLATFORMS.map((p, i) => (
          <button
            key={p.key}
            type="button"
            title={tp(`${p.key}.name`)}
            aria-label={tp(`${p.key}.name`)}
            aria-pressed={connected[i]}
            onClick={() => setConnected((c) => c.map((v, j) => (j === i ? !v : v)))}
            className="cursor-pointer rounded-[13px] transition-[opacity,filter,transform] duration-[250ms] active:scale-[0.94]"
            style={{
              opacity: connected[i] ? 1 : 0.3,
              filter: connected[i] ? 'none' : 'grayscale(1)',
            }}
          >
            <PlatformTile p={p} size={48} radius={13} glyph={21} />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-l-muted">
        <span>{t('count', { count })}</span>
        <span className="text-l-dim">{t('hint')}</span>
      </div>
    </div>
  )
}

export function ApproveDemo() {
  const t = useTranslations('site.how.approveDemo')
  const demo = useTranslations('site.demo')
  const [approved, setApproved] = useState(false)
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <div className="flex items-center gap-3 rounded-xl border border-l-line/14 bg-l-inner p-2.5">
        <Image
          src="/landing/kroasani.jpg"
          alt=""
          width={46}
          height={46}
          className="size-[46px] rounded-[9px] bg-l-img object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{demo('postTitle')}</div>
          <div className="mt-0.5 text-xs text-l-dim">{t('when')}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] border border-l-line/20 text-[13.5px] font-medium text-l-text-2">
          {t('edit')}
        </span>
        <button
          type="button"
          onClick={() => setApproved((v) => !v)}
          aria-pressed={approved}
          className={cn(
            'flex h-10 flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[13.5px] font-semibold transition-[background-color,color] duration-[250ms]',
            approved ? 'bg-l-success/14 text-l-success' : 'bg-l-accent text-l-on-accent',
          )}
        >
          <Fa icon={approved ? faCheck : faThumbsUp} style={{ fontSize: 12 }} />
          {approved ? t('approved') : t('approve')}
        </button>
      </div>
      <div aria-live="polite" className="text-center text-xs text-l-dim">
        {approved ? t('scheduled') : t('link')}
      </div>
    </div>
  )
}
