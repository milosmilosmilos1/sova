'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { cn } from 'cn'

import { fullNumber, niceScale, tickFormatter, valueLabel } from './scale'

/**
 * Stubičasti grafikon jedne serije (D-092): zbir po danu ili nedelji. Stub najviše 24 px, zaobljen
 * 4 px na vrhu i ravan na osnovi, razmak između stubova je površina kartice; vrednost se piše samo
 * na najvišem stubu, ostale nose osa, oblačić (mišem ili strelicama) i tabela.
 */
export interface ColumnBar {
  key: string
  /** kratak natpis ispod ose (npr. „20. okt”) */
  label: string
  /** pun natpis u oblačiću i tabeli (npr. „nedelja od 20. okt”) */
  longLabel: string
  value: number
}

const PLOT_HEIGHT = 168
const AXIS_BAND = 24
const PAD = { top: 18, right: 12, left: 44 }
const MAX_BAR = 24
const usd = new Intl.NumberFormat('sr-Latn-RS', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
})

/** Putanja stuba: zaobljen vrh, ravna osnova. */
function barPath(x: number, w: number, top: number, base: number): string {
  const h = base - top
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
}

export function ColumnChart({
  title,
  description,
  bars,
  unit = 'count',
  dim = false,
  emptyText = 'Još nema podataka za ovaj period.',
}: {
  title: string
  description?: string
  bars: ColumnBar[]
  /** tekstualno, jer serverske strane ne mogu da proslede funkciju klijentskoj komponenti */
  unit?: 'count' | 'usd'
  dim?: boolean
  emptyText?: string
}) {
  const format = unit === 'usd' ? (v: number) => usd.format(v) : (v: number) => fullNumber.format(v)
  const ref = useRef<HTMLDivElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const titleId = useId()

  const plotRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    ref.current = el
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)))
    observer.current.observe(el)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])

  const empty = bars.length === 0 || bars.every((b) => b.value === 0)
  const geo = useMemo(() => {
    if (!width || bars.length === 0) return null
    const scale = niceScale(0, Math.max(...bars.map((b) => b.value)))
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const slot = innerW / bars.length
    const barW = Math.max(2, Math.min(MAX_BAR, slot * 0.62))
    const xOf = (i: number) => PAD.left + i * slot + (slot - barW) / 2
    const y = (v: number) => PAD.top + PLOT_HEIGHT - (v / (scale.hi - scale.lo || 1)) * PLOT_HEIGHT
    const base = y(0)
    const maxIndex = bars.reduce((m, b, i) => (b.value > bars[m]!.value ? i : m), 0)
    return { scale, slot, barW, xOf, y, base, maxIndex, tickLabel: tickFormatter(scale) }
  }, [width, bars])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((a) => Math.min(bars.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : bars.length)) + d)))
    }
    if (e.key === 'Escape') setActive(null)
  }

  const last = bars.length - 1
  const xLabels = bars.length > 2 ? [0, Math.floor(last / 2), last] : bars.map((_, i) => i)
  const height = PLOT_HEIGHT + PAD.top + AXIS_BAND

  return (
    <figure className="space-y-3" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-3">
        <figcaption>
          <p id={titleId} className="text-sm font-medium">
            {title}
          </p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </figcaption>
        {!empty ? (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            aria-pressed={asTable}
          >
            {asTable ? 'Grafikon' : 'Tabela'}
          </button>
        ) : null}
      </div>

      {empty ? (
        <p className="grid h-[210px] place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : asTable ? (
        <div className="max-h-[210px] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-normal">Period</th>
                <th className="px-3 py-1.5 text-right font-normal">{title}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {bars.map((b) => (
                <tr key={b.key} className="border-t">
                  <td className="px-3 py-1">{b.longLabel}</td>
                  <td className="px-3 py-1 text-right">{format(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={plotRef}
          className={cn('relative transition-opacity', dim && 'opacity-50')}
          style={{ height }}
        >
          {geo ? (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${title}: najviše ${format(bars[geo.maxIndex]!.value)} (${bars[geo.maxIndex]!.longLabel}). Strelicama birate stub.`}
              tabIndex={0}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onKeyDown={onKey}
              onBlur={() => setActive(null)}
              onPointerLeave={() => setActive(null)}
            >
              {geo.scale.ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={geo.y(t)}
                    y2={geo.y(t)}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={geo.y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px] tabular-nums"
                  >
                    {geo.tickLabel(t)}
                  </text>
                </g>
              ))}
              {bars.map((b, i) => {
                const x = geo.xOf(i)
                const top = geo.y(b.value)
                return (
                  <g key={b.key}>
                    <path
                      d={barPath(x, geo.barW, top, geo.base)}
                      fill="var(--chart-1)"
                      fillOpacity={active === null || active === i ? 1 : 0.55}
                    />
                    {/* pogodak je ceo pojas stuba, ne samo obojeni pikseli */}
                    <rect
                      x={PAD.left + i * geo.slot}
                      y={PAD.top}
                      width={geo.slot}
                      height={PLOT_HEIGHT}
                      fill="transparent"
                      onPointerEnter={() => setActive(i)}
                      onPointerMove={() => setActive(i)}
                    />
                  </g>
                )
              })}
              <text
                x={geo.xOf(geo.maxIndex) + geo.barW / 2}
                y={geo.y(bars[geo.maxIndex]!.value) - 6}
                textAnchor="middle"
                className="pointer-events-none fill-foreground text-xs font-medium"
              >
                {unit === 'usd' ? format(bars[geo.maxIndex]!.value) : valueLabel(bars[geo.maxIndex]!.value)}
              </text>
              {xLabels.map((i) => (
                <text
                  key={i}
                  x={geo.xOf(i) + geo.barW / 2}
                  y={PAD.top + PLOT_HEIGHT + 17}
                  textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                  className="fill-muted-foreground text-[11px]"
                >
                  {bars[i]!.label}
                </text>
              ))}
            </svg>
          ) : null}
          {geo && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: Math.min(Math.max(geo.xOf(active) + geo.barW / 2 - 70, 0), Math.max(0, width - 150)),
              }}
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-popover-foreground">
                <span aria-hidden className="inline-block size-2.5 rounded-sm bg-chart-1" />
                {format(bars[active]!.value)}
              </p>
              <p className="text-muted-foreground">{bars[active]!.longLabel}</p>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  )
}
