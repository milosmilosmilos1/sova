import type { ReactNode } from 'react'

import { cn } from 'cn'

/** Naslov sekcije iz dizajna (D-098): H2 do 52 px, istaknuta fraza u plavoj, podnaslov do 560–600 px. */
export function SectionHeading({
  title,
  sub,
  subWidth = 560,
}: {
  title: ReactNode
  sub?: ReactNode
  subWidth?: number
}) {
  return (
    <div className="mb-12">
      <h2 className="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
        {title}
      </h2>
      {sub ? (
        <p
          className="mt-4 text-[17px] leading-[1.55] text-pretty text-l-muted"
          style={{ maxWidth: subWidth }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}

export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-l-accent">{children}</span>
}

export function Section({
  id,
  alt,
  className,
  children,
}: {
  id?: string
  /** naizmenična pozadina sa tankim ivicama (Funkcije, Cene) */
  alt?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={cn('px-6 py-[110px]', alt && 'border-y border-l-line/8 bg-l-bg-alt', className)}
    >
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </section>
  )
}

/** Kartica sa vizuelnim delom gore i tekstom dole (funkcije, koraci). */
export function DemoCard({
  className,
  visual,
  visualClassName,
  visualHeight,
  title,
  children,
  hover = true,
  badge,
}: {
  className?: string
  visual: ReactNode
  visualClassName?: string
  visualHeight: number
  title: string
  children: ReactNode
  hover?: boolean
  /** oznaka koraka iznad naslova (01, 02, 03) */
  badge?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-l-line/12 bg-l-card',
        hover && 'transition-[border-color] duration-[250ms] hover:border-l-line/26',
        className,
      )}
    >
      <div
        className={cn('relative border-b border-l-line/10 bg-l-visual', visualClassName)}
        style={{ height: visualHeight }}
      >
        {visual}
      </div>
      <div className="px-6 pt-[22px] pb-[26px]">
        {badge ? (
          <span className="rounded-md bg-l-accent/10 px-2 py-[3px] font-l-mono text-[11px] text-l-accent">
            {badge}
          </span>
        ) : null}
        <h3 className={cn('text-lg font-semibold tracking-[-0.015em]', badge && 'mt-3.5')}>{title}</h3>
        <p className="mt-2 text-[14.5px] leading-[1.55] text-pretty text-l-muted">{children}</p>
      </div>
    </div>
  )
}
