'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { cn } from 'cn'

import { dayLabel, fullNumber, niceScale, tickFormatter, valueLabel } from './scale'

/**
 * Grafikon trenda jedne serije (D-062, D-092): linija 2 px sa blagom površinom, horizontalne linije
 * mreže kao tanke ivice, vrednost na kraju linije, vertikalna linija i oblačić na prelaz mišem i na
 * tastaturi (strelice), i prikaz kao tabela umesto grafikona. Jedna serija nema legendu: naslov kaže
 * šta je nacrtano. Boja je `--chart-1` (proverena validatorom za svetlu i tamnu temu).
 */
export interface TrendPoint {
  date: string
  value: number
}

const PLOT_HEIGHT = 168
const AXIS_BAND = 24
const PAD = { top: 12, right: 56, left: 44 }

export function TrendChart({
  title,
  description,
  points,
  format = (v) => fullNumber.format(v),
  zeroBaseline = true,
  dim = false,
  emptyText = 'Još nema podataka za ovaj period.',
}: {
  title: string
  description?: string
  points: TrendPoint[]
  format?: (v: number) => string
  zeroBaseline?: boolean
  dim?: boolean
  emptyText?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const titleId = useId()

  // posmatrač veličine se kači kad se površina grafikona pojavi (i posle povratka iz tabele)
  const observer = useRef<ResizeObserver | null>(null)
  const plotRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    ref.current = el
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)))
    observer.current.observe(el)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])

  const empty = points.length === 0 || points.every((p) => p.value === 0)
  const geo = useMemo(() => {
    if (!width || points.length === 0) return null
    const values = points.map((p) => p.value)
    const scale = niceScale(Math.min(...values), Math.max(...values), zeroBaseline)
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1))
    const y = (v: number) => PAD.top + PLOT_HEIGHT - ((v - scale.lo) / (scale.hi - scale.lo)) * PLOT_HEIGHT
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
    const base = y(scale.lo)
    const area = `${line}L${x(points.length - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z`
    return { scale, x, y, line, area, base, tickLabel: tickFormatter(scale) }
  }, [width, points, zeroBaseline])

  const pick = (clientX: number) => {
    if (!geo || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const rel = clientX - rect.left - PAD.left
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const i = Math.round((rel / innerW) * (points.length - 1))
    setActive(Math.min(points.length - 1, Math.max(0, i)))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : points.length)) + d)))
    }
    if (e.key === 'Escape') setActive(null)
  }

  const last = points.length - 1
  const tickLabel = geo?.tickLabel ?? ((v: number) => fullNumber.format(v))
  const shown = active ?? null
  const xLabels = points.length > 2 ? [0, Math.floor(last / 2), last] : points.map((_, i) => i)

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
        <p className="grid h-[192px] place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : asTable ? (
        <div className="max-h-[192px] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-normal">Dan</th>
                <th className="px-3 py-1.5 text-right font-normal">{title}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((p) => (
                <tr key={p.date} className="border-t">
                  <td className="px-3 py-1">{dayLabel(p.date)}</td>
                  <td className="px-3 py-1 text-right">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={plotRef}
          className={cn('relative transition-opacity', dim && 'opacity-50')}
          style={{ height: PLOT_HEIGHT + PAD.top + AXIS_BAND }}
        >
          {geo ? (
            <svg
              width={width}
              height={PLOT_HEIGHT + PAD.top + AXIS_BAND}
              role="img"
              aria-label={`${title}: od ${format(points[0]!.value)} do ${format(points[last]!.value)}. Strelicama birate dan.`}
              tabIndex={0}
              className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onPointerMove={(e: PointerEvent) => pick(e.clientX)}
              onPointerLeave={() => setActive(null)}
              onKeyDown={onKey}
              onBlur={() => setActive(null)}
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
                    {tickLabel(t)}
                  </text>
                </g>
              ))}
              {xLabels.map((i) => (
                <text
                  key={i}
                  x={geo.x(i)}
                  y={PAD.top + PLOT_HEIGHT + 17}
                  textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                  className="fill-muted-foreground text-[11px]"
                >
                  {dayLabel(points[i]!.date)}
                </text>
              ))}
              <path d={geo.area} fill="var(--chart-1)" fillOpacity={0.1} />
              <path
                d={geo.line}
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* vrednost na kraju linije (jedina stalna oznaka; ostalo nose osa, oblačić i tabela) */}
              <circle
                cx={geo.x(last)}
                cy={geo.y(points[last]!.value)}
                r={4}
                fill="var(--chart-1)"
                stroke="var(--card)"
                strokeWidth={2}
              />
              <text
                x={geo.x(last) + 8}
                y={geo.y(points[last]!.value)}
                dy="0.32em"
                className="fill-foreground text-xs font-medium"
              >
                {valueLabel(points[last]!.value)}
              </text>
              {shown !== null ? (
                <g pointerEvents="none">
                  <line
                    x1={geo.x(shown)}
                    x2={geo.x(shown)}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_HEIGHT}
                    className="stroke-muted-foreground/40"
                    strokeWidth={1}
                  />
                  <circle
                    cx={geo.x(shown)}
                    cy={geo.y(points[shown]!.value)}
                    r={4}
                    fill="var(--chart-1)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                </g>
              ) : null}
            </svg>
          ) : null}
          {geo && shown !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: Math.min(Math.max(geo.x(shown) - 60, 0), Math.max(0, width - 130)),
              }}
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-popover-foreground">
                <span aria-hidden className="inline-block h-0.5 w-3 rounded-full bg-chart-1" />
                {format(points[shown]!.value)}
              </p>
              <p className="text-muted-foreground">{dayLabel(points[shown]!.date)}</p>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  )
}
