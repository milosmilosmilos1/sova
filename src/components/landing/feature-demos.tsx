'use client'

import { faLightbulb } from '@fortawesome/free-regular-svg-icons'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { useState } from 'react'

import { cn } from 'cn'

import { Fa } from './icons'

/** Interaktivni delovi kartica u sekciji „Funkcije” (D-098); sve je lokalno stanje, bez servera. */
const CAPTIONS = {
  lat: [
    'Jutro počinje mirisom. Kroasani izlaze iz peći u 7:00 – dođite dok su topli.',
    '#novisad #pekara #doručak',
  ],
  cyr: [
    'Јутро почиње мирисом. Кроасани излазе из пећи у 7:00 – дођите док су топли.',
    '#новисад #пекара #доручак',
  ],
  en: [
    'Mornings smell better here. Croissants leave the oven at 7:00 – get them while they’re warm.',
    '#novisad #bakery #breakfast',
  ],
} as const

type Script = keyof typeof CAPTIONS

export function ScriptDemo() {
  const [script, setScript] = useState<Script>('lat')
  const options: Array<[Script, string]> = [
    ['lat', 'Latinica'],
    ['cyr', 'Ćirilica'],
    ['en', 'English'],
  ]
  const [caption, tags] = CAPTIONS[script]
  return (
    <div className="flex h-full flex-col gap-3.5 p-5">
      <div
        role="group"
        aria-label="Pismo i jezik teksta"
        className="flex gap-0.5 self-start rounded-[10px] border border-l-line/12 bg-l-rail p-[3px]"
      >
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScript(key)}
            aria-pressed={script === key}
            className={cn(
              'cursor-pointer rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-[background-color,color] duration-200',
              script === key ? 'bg-l-text text-l-on-accent' : 'text-l-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-l-line/12 bg-l-inner">
        <div className="relative min-h-0 flex-1 bg-l-img">
          <Image
            src="/landing/kroasani-pec.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, 90vw"
            className="object-cover"
          />
        </div>
        <div className="px-3.5 pt-3 pb-3.5">
          <div className="min-h-10 text-[13.5px] leading-normal text-l-text">{caption}</div>
          <div className="mt-1.5 text-[12.5px] text-l-accent-soft">{tags}</div>
        </div>
      </div>
    </div>
  )
}

/** Prekidač kao u dizajnu: 46 × 26, kružić 20, uključeno plavo. */
export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-[26px] w-[46px] flex-none cursor-pointer rounded-[13px] transition-[background-color] duration-[250ms]',
        on ? 'bg-l-accent' : 'bg-l-track',
      )}
    >
      <span
        className="absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-[250ms] ease-[cubic-bezier(.3,.7,.4,1)]"
        style={{ transform: on ? 'translateX(20px)' : 'none' }}
      />
    </button>
  )
}

export function AutopilotDemo() {
  const [on, setOn] = useState(true)
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-l-line/14 bg-l-inner px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Autopilot</div>
          <div className="mt-0.5 text-[12.5px] text-l-muted">
            {on ? 'Sledeća objava: pon 08:00' : 'Sve objave čekaju vaše odobrenje'}
          </div>
        </div>
        <Switch on={on} onChange={setOn} label="Uključi ili isključi Autopilot" />
      </div>
      <div>
        <div className="mb-[7px] flex justify-between text-[12.5px]">
          <span className="text-l-muted">Budžet tokena, novembar</span>
          <span className="font-l-mono text-l-text-2">186 / 500</span>
        </div>
        <div className="h-1.5 rounded-[3px] bg-l-chip">
          <div className="h-full w-[37%] rounded-[3px] bg-l-accent" />
        </div>
      </div>
      <div className="flex flex-col gap-[9px] text-[13px] text-l-text-2">
        {[
          'Provera kvaliteta pre svake objave',
          'Najviše 3 objave nedeljno',
          'Akcije i cene uvek čekaju odobrenje',
        ].map((rule) => (
          <span key={rule} className="flex items-center gap-[9px]">
            <Fa icon={faCircleCheck} className="text-l-success" style={{ fontSize: 13 }} />
            {rule}
          </span>
        ))}
      </div>
    </div>
  )
}

const BARS = [
  { d: 'PON', full: 'Ponedeljak', v: 2140 },
  { d: 'UTO', full: 'Utorak', v: 4820 },
  { d: 'SRE', full: 'Sreda', v: 2610 },
  { d: 'ČET', full: 'Četvrtak', v: 1980 },
  { d: 'PET', full: 'Petak', v: 3350 },
  { d: 'SUB', full: 'Subota', v: 2240 },
  { d: 'NED', full: 'Nedelja', v: 1260 },
]
const num = new Intl.NumberFormat('sr-Latn-RS')

export function ReachDemo() {
  const [active, setActive] = useState(1)
  const max = Math.max(...BARS.map((b) => b.v))
  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-xs text-l-dim">Doseg, poslednjih 7 dana</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-[-0.03em]">18.400</span>
            <span className="text-[12.5px] text-l-success">+32%</span>
          </div>
        </div>
        <span
          aria-live="polite"
          className="rounded-[7px] border border-l-line/14 bg-l-inner px-[9px] py-[5px] text-[11.5px] whitespace-nowrap text-l-text-2"
        >
          {BARS[active]!.full} · {num.format(BARS[active]!.v)}
        </span>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 gap-2">
        {BARS.map((b, i) => (
          <button
            key={b.d}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${b.full}: ${num.format(b.v)}`}
            aria-pressed={i === active}
            className="flex flex-1 cursor-pointer flex-col gap-[7px]"
          >
            <span className="flex w-full flex-1 items-end">
              <span
                className={cn(
                  'w-full rounded-[6px_6px_3px_3px] transition-[background-color] duration-200',
                  i === active ? 'bg-l-accent' : 'bg-l-accent/25',
                )}
                style={{ height: `${Math.round((b.v / max) * 100)}%` }}
              />
            </span>
            <span
              className={cn(
                'text-center font-l-mono text-[10px]',
                i === active ? 'text-l-text' : 'text-l-dim',
              )}
            >
              {b.d}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12.5px] text-l-accent-pale">
        <Fa icon={faLightbulb} style={{ fontSize: 12 }} />
        Najbolji termin: utorak u 19h
      </div>
    </div>
  )
}
