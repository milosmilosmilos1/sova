import 'server-only'

import path from 'node:path'
import { Fragment } from 'react'

import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer'

import { chartNumbers, niceScale } from '@/components/charts/scale'
import type { AppLocale } from '@/i18n/config'

import { REPORT_COPY, type ReportCopy } from './copy'

/**
 * Mesečni izveštaj kao PDF (D-094): A4, Inter iz `src/lib/visuals/fonts` (latinica sa č, ć, đ i
 * strelicama), boje tema tokena preračunate u hex. Grafikon je od pravougaonika, po pravilima iz
 * aplikacije (D-092): jedna serija bez legende, vrednost samo na najvišem stubu, tanka mreža.
 */

const INK = '#111826'
const MUTED = '#5b6472'
const BORDER = '#dfe3ea'
const SURFACE = '#f4f7fb'
const PRIMARY = '#2867e4'
const CONTENT_WIDTH = 523

export interface ReportKpi {
  label: string
  value: string
  /** promena u odnosu na prethodni mesec u procentima; null kad poređenje nije moguće */
  delta: number | null
}

export interface ReportRow {
  label: string
  posts: number
  reach: number
  engagement: number
  engagementRate: number | null
}

export interface ReportPost {
  date: string
  platform: string
  excerpt: string
  reach: number | null
  engagement: number
  engagementRate: number | null
}

export interface ReportFollowers {
  account: string
  first: number | null
  last: number | null
  delta: number | null
}

export interface MonthlyReportData {
  /** jezik izveštaja: jezik brenda (D-130) */
  locale?: AppLocale
  brandName: string
  /** „oktobar 2026.” */
  month: string
  /** „septembar”, za poređenje */
  previousMonth: string
  /** „1. 11. 2026.” */
  generatedAt: string
  kpis: ReportKpi[]
  /** doseg po danu objave, svaki dan meseca (nula kad nije bilo objava) */
  daily: Array<{ date: string; label: string; value: number }>
  platforms: ReportRow[]
  pillars: ReportRow[]
  topPosts: ReportPost[]
  followers: ReportFollowers[]
  insights: Array<{ claim: string; recommendation: string }>
  notes: string[]
  /** u mesecu nije bilo objavljenih objava */
  empty: boolean
}

let fontsReady = false

function registerFonts(): void {
  if (fontsReady) return
  const dir = path.join(process.cwd(), 'src', 'lib', 'visuals', 'fonts')
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(dir, 'Inter-400.woff'), fontWeight: 400 },
      { src: path.join(dir, 'Inter-700.woff'), fontWeight: 700 },
    ],
  })
  // srpski tekst se ne deli na slogove (podrazumevano je englesko deljenje reči)
  Font.registerHyphenationCallback((word) => [word])
  fontsReady = true
}

/** Brojevi, procenti i promene na jeziku izveštaja (engleski piše procenat bez razmaka). */
function formats(copy: ReportCopy) {
  const num = new Intl.NumberFormat(copy.intl)
  const signed = new Intl.NumberFormat(copy.intl, { signDisplay: 'exceptZero' })
  const pct = (value: string) => (copy.intl === 'en-GB' ? `${value}%` : `${value} %`)
  return {
    num: (v: number | null) => (v === null ? '—' : num.format(v)),
    signed: (v: number) => signed.format(v),
    rate: (v: number | null) =>
      v === null ? '—' : pct((v * 100).toLocaleString(copy.intl, { maximumFractionDigits: 1 })),
    delta: (delta: number | null, previousMonth: string) => {
      if (delta === null) return copy.noComparison
      if (delta === 0) return copy.same(previousMonth)
      return copy.vs(
        `${delta > 0 ? '↑' : '↓'} ${pct(Math.abs(delta).toLocaleString(copy.intl))}`,
        previousMonth,
      )
    },
  }
}
type Formats = ReturnType<typeof formats>

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: INK,
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 54,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: PRIMARY,
    marginBottom: 18,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  eye: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  pupil: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: INK },
  logoText: { fontSize: 14, fontWeight: 700 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 16, fontWeight: 700, lineHeight: 1.25 },
  subtitle: { fontSize: 10, color: MUTED, lineHeight: 1.4, marginTop: 2 },
  kpis: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  kpi: {
    width: (CONTENT_WIDTH - 4 * 8) / 5,
    backgroundColor: SURFACE,
    borderRadius: 6,
    padding: 8,
  },
  kpiLabel: { fontSize: 7.5, color: MUTED, lineHeight: 1.3 },
  kpiValue: { fontSize: 15, fontWeight: 700, lineHeight: 1.25, marginTop: 2 },
  kpiDelta: { fontSize: 7, color: MUTED, lineHeight: 1.35, marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 },
  sectionNote: { fontSize: 8, color: MUTED, lineHeight: 1.4, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 3.5,
  },
  headRow: { flexDirection: 'row', paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: MUTED },
  headCell: { fontSize: 7.5, fontWeight: 700, color: MUTED, lineHeight: 1.3 },
  cell: { fontSize: 9, lineHeight: 1.35 },
  emptyBox: {
    backgroundColor: SURFACE,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    color: MUTED,
    fontSize: 9,
    lineHeight: 1.4,
  },
  insight: { marginBottom: 6 },
  insightClaim: { fontSize: 9, fontWeight: 700, lineHeight: 1.4 },
  insightRec: { fontSize: 9, color: MUTED, lineHeight: 1.4 },
  notes: { fontSize: 7.5, color: MUTED, lineHeight: 1.4, marginTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
})

interface Column {
  title: string
  /** širina u pt; bez nje kolona zauzima ostatak reda */
  width?: number
  align?: 'left' | 'right'
}

function Table({ columns, rows }: { columns: Column[]; rows: string[][] }) {
  const cell = (c: Column) => ({
    ...(c.width ? { width: c.width } : { flex: 1 }),
    textAlign: c.align ?? 'left',
    paddingRight: c.align === 'right' ? 0 : 6,
    paddingLeft: c.align === 'right' ? 6 : 0,
  })
  return (
    <View>
      <View style={s.headRow} wrap={false}>
        {columns.map((c) => (
          <Text key={c.title} style={[s.headCell, cell(c)]}>
            {c.title}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row} wrap={false}>
          {r.map((v, j) => (
            <Text key={j} style={[s.cell, cell(columns[j]!)]}>
              {v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

const PLOT_HEIGHT = 110
const AXIS_LEFT = 38
const TOP = 14
const X_BAND = 16
const MAX_BAR = 12

/** Doseg po danu objave: stubovi od pravougaonika, zaobljen vrh, oznaka samo na najvišem. */
function DailyColumns({ points, intl }: { points: MonthlyReportData['daily']; intl: string }) {
  const numbers = chartNumbers(intl)
  const max = Math.max(...points.map((p) => p.value))
  const scale = niceScale(0, max)
  const tick = numbers.tick(scale)
  const innerW = CONTENT_WIDTH - AXIS_LEFT
  const slot = innerW / points.length
  const barW = Math.max(2, Math.min(MAX_BAR, slot * 0.62))
  const h = (v: number) => (v / (scale.hi - scale.lo || 1)) * PLOT_HEIGHT
  const base = TOP + PLOT_HEIGHT
  const maxIndex = points.reduce((m, p, i) => (p.value > points[m]!.value ? i : m), 0)
  const last = points.length - 1
  const labels = points.length > 2 ? [0, Math.floor(last / 2), last] : points.map((_, i) => i)
  return (
    <View style={{ width: CONTENT_WIDTH, height: base + X_BAND, position: 'relative' }}>
      {scale.ticks.map((t) => (
        <Fragment key={t}>
          <View
            style={{
              position: 'absolute',
              left: AXIS_LEFT,
              right: 0,
              top: base - h(t),
              height: 0.5,
              backgroundColor: BORDER,
            }}
          />
          <Text
            style={{
              position: 'absolute',
              left: 0,
              width: AXIS_LEFT - 6,
              top: base - h(t) - 4.5,
              fontSize: 7,
              color: MUTED,
              textAlign: 'right',
            }}
          >
            {tick(t)}
          </Text>
        </Fragment>
      ))}
      {points.map((p, i) =>
        p.value > 0 ? (
          <View
            key={p.date}
            style={{
              position: 'absolute',
              left: AXIS_LEFT + i * slot + (slot - barW) / 2,
              top: base - h(p.value),
              width: barW,
              height: h(p.value),
              backgroundColor: PRIMARY,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
        ) : null,
      )}
      <Text
        style={{
          position: 'absolute',
          left: AXIS_LEFT + maxIndex * slot + slot / 2 - 30,
          width: 60,
          top: base - h(max) - 11,
          fontSize: 7,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {numbers.value(max)}
      </Text>
      {labels.map((i) => (
        <Text
          key={i}
          style={{
            position: 'absolute',
            top: base + 4,
            width: 60,
            fontSize: 7,
            color: MUTED,
            ...(i === last
              ? { right: 0, textAlign: 'right' as const }
              : i === 0
                ? { left: AXIS_LEFT }
                : { left: AXIS_LEFT + i * slot + slot / 2 - 30, textAlign: 'center' as const }),
          }}
        >
          {points[i]!.label}
        </Text>
      ))}
    </View>
  )
}

function groupRows(rows: ReportRow[], f: Formats): string[][] {
  return rows.map((r) => [
    r.label,
    f.num(r.posts),
    f.num(r.reach),
    f.num(r.engagement),
    f.rate(r.engagementRate),
  ])
}

const GROUP_COLUMNS = (first: string, copy: ReportCopy): Column[] => [
  { title: first },
  { title: copy.columns.posts, width: 60, align: 'right' },
  { title: copy.columns.reach, width: 80, align: 'right' },
  { title: copy.columns.engagement, width: 80, align: 'right' },
  { title: copy.columns.rate, width: 60, align: 'right' },
]

export function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  const reachTotal = data.daily.reduce((n, p) => n + p.value, 0)
  const copy = REPORT_COPY[data.locale ?? 'sr-Latn']
  const f = formats(copy)
  return (
    <Document
      title={copy.docTitle(data.brandName, data.month)}
      author="Sova"
      creator="Sova"
      producer="Sova"
      subject={copy.subject(data.month)}
      language={data.locale ?? 'sr-Latn'}
    >
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>{copy.footer(data.brandName, data.generatedAt)}</Text>
          <Text render={({ pageNumber, totalPages }) => copy.page(pageNumber, totalPages)} />
        </View>
        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={s.mark}>
              <View style={s.eye}>
                <View style={s.pupil} />
              </View>
              <View style={s.eye}>
                <View style={s.pupil} />
              </View>
            </View>
            <Text style={s.logoText}>Sova</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>{copy.title}</Text>
            <Text style={s.subtitle}>
              {data.brandName} · {data.month}
            </Text>
          </View>
        </View>

        <View style={s.kpis}>
          {data.kpis.map((k) => (
            <View key={k.label} style={s.kpi}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
              <Text style={s.kpiDelta}>{f.delta(k.delta, data.previousMonth)}</Text>
            </View>
          ))}
        </View>

        {data.empty ? (
          <Text style={s.emptyBox}>{copy.empty}</Text>
        ) : (
          <>
            <View style={s.section} wrap={false}>
              <Text style={s.sectionTitle}>{copy.sections.daily}</Text>
              {reachTotal > 0 ? (
                <DailyColumns points={data.daily} intl={copy.intl} />
              ) : (
                <Text style={s.sectionNote}>{copy.notMeasured}</Text>
              )}
            </View>

            {data.platforms.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>{copy.sections.platforms}</Text>
                <Table
                  columns={GROUP_COLUMNS(copy.columns.network, copy)}
                  rows={groupRows(data.platforms, f)}
                />
              </View>
            ) : null}

            {data.topPosts.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>{copy.sections.topPosts}</Text>
                <Table
                  columns={[
                    { title: copy.columns.date, width: 40 },
                    { title: copy.columns.network, width: 62 },
                    { title: copy.columns.post },
                    { title: copy.columns.reach, width: 56, align: 'right' },
                    { title: copy.columns.engagement, width: 62, align: 'right' },
                    { title: copy.columns.rate, width: 44, align: 'right' },
                  ]}
                  rows={data.topPosts.map((p) => [
                    p.date,
                    p.platform,
                    p.excerpt,
                    f.num(p.reach),
                    f.num(p.engagement),
                    f.rate(p.engagementRate),
                  ])}
                />
              </View>
            ) : null}

            {data.pillars.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>{copy.sections.pillars}</Text>
                <Table columns={GROUP_COLUMNS(copy.columns.pillar, copy)} rows={groupRows(data.pillars, f)} />
              </View>
            ) : null}
          </>
        )}

        {data.followers.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>{copy.sections.followers}</Text>
            <Table
              columns={[
                { title: copy.columns.account },
                { title: copy.columns.monthStart, width: 90, align: 'right' },
                { title: copy.columns.monthEnd, width: 90, align: 'right' },
                { title: copy.columns.change, width: 70, align: 'right' },
              ]}
              rows={data.followers.map((r) => [
                r.account,
                f.num(r.first),
                f.num(r.last),
                r.delta === null ? '—' : f.signed(r.delta),
              ])}
            />
          </View>
        ) : null}

        {data.insights.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>{copy.sections.insights}</Text>
            {data.insights.map((i, n) => (
              <View key={n} style={s.insight} wrap={false}>
                <Text style={s.insightClaim}>{i.claim}</Text>
                <Text style={s.insightRec}>{i.recommendation}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.notes.length ? (
          <View>
            {data.notes.map((n) => (
              <Text key={n} style={s.notes}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  )
}

export async function renderMonthlyReport(data: MonthlyReportData): Promise<Buffer> {
  registerFonts()
  return renderToBuffer(<MonthlyReportDocument data={data} />)
}
