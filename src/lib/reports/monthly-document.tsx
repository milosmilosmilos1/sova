import 'server-only'

import path from 'node:path'
import { Fragment } from 'react'

import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer'

import { niceScale, tickFormatter, valueLabel } from '@/components/charts/scale'

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

const num = new Intl.NumberFormat('sr-Latn-RS')
const signed = new Intl.NumberFormat('sr-Latn-RS', { signDisplay: 'exceptZero' })
const fmtNum = (v: number | null) => (v === null ? '—' : num.format(v))
const fmtRate = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })} %`

function deltaText(delta: number | null, previousMonth: string): string {
  if (delta === null) return 'bez poređenja'
  if (delta === 0) return `isto kao ${previousMonth}`
  return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('sr-Latn-RS')} % u odnosu na ${previousMonth}`
}

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
function DailyColumns({ points }: { points: MonthlyReportData['daily'] }) {
  const max = Math.max(...points.map((p) => p.value))
  const scale = niceScale(0, max)
  const tick = tickFormatter(scale)
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
        {valueLabel(max)}
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

function groupRows(rows: ReportRow[]): string[][] {
  return rows.map((r) => [
    r.label,
    fmtNum(r.posts),
    fmtNum(r.reach),
    fmtNum(r.engagement),
    fmtRate(r.engagementRate),
  ])
}

const GROUP_COLUMNS = (first: string): Column[] => [
  { title: first },
  { title: 'Objave', width: 60, align: 'right' },
  { title: 'Doseg', width: 80, align: 'right' },
  { title: 'Angažovanje', width: 80, align: 'right' },
  { title: 'Stopa', width: 60, align: 'right' },
]

export function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  const reachTotal = data.daily.reduce((n, p) => n + p.value, 0)
  return (
    <Document
      title={`Mesečni izveštaj · ${data.brandName} · ${data.month}`}
      author="Sova"
      creator="Sova"
      producer="Sova"
      subject={`Društvene mreže za ${data.month}`}
      language="sr-Latn"
    >
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>
            Sova · {data.brandName} · napravljeno {data.generatedAt}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `strana ${pageNumber} od ${totalPages}`} />
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
            <Text style={s.title}>Mesečni izveštaj</Text>
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
              <Text style={s.kpiDelta}>{deltaText(k.delta, data.previousMonth)}</Text>
            </View>
          ))}
        </View>

        {data.empty ? (
          <Text style={s.emptyBox}>
            U ovom mesecu nije bilo objavljenih objava, pa nema dosega ni angažovanja za prikaz.
          </Text>
        ) : (
          <>
            <View style={s.section} wrap={false}>
              <Text style={s.sectionTitle}>Doseg po danu objave</Text>
              {reachTotal > 0 ? (
                <DailyColumns points={data.daily} />
              ) : (
                <Text style={s.sectionNote}>
                  Doseg još nije izmeren: mreže ga daju sat vremena posle objave, pa posle 24 sata, 7 i 30
                  dana.
                </Text>
              )}
            </View>

            {data.platforms.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>Po mreži</Text>
                <Table columns={GROUP_COLUMNS('Mreža')} rows={groupRows(data.platforms)} />
              </View>
            ) : null}

            {data.topPosts.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>Najbolje objave</Text>
                <Table
                  columns={[
                    { title: 'Datum', width: 40 },
                    { title: 'Mreža', width: 62 },
                    { title: 'Objava' },
                    { title: 'Doseg', width: 56, align: 'right' },
                    { title: 'Angažovanje', width: 62, align: 'right' },
                    { title: 'Stopa', width: 44, align: 'right' },
                  ]}
                  rows={data.topPosts.map((p) => [
                    p.date,
                    p.platform,
                    p.excerpt,
                    fmtNum(p.reach),
                    fmtNum(p.engagement),
                    fmtRate(p.engagementRate),
                  ])}
                />
              </View>
            ) : null}

            {data.pillars.length ? (
              <View style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>Stubovi sadržaja</Text>
                <Table columns={GROUP_COLUMNS('Stub')} rows={groupRows(data.pillars)} />
              </View>
            ) : null}
          </>
        )}

        {data.followers.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Pratioci</Text>
            <Table
              columns={[
                { title: 'Nalog' },
                { title: 'Početak meseca', width: 90, align: 'right' },
                { title: 'Kraj meseca', width: 90, align: 'right' },
                { title: 'Promena', width: 70, align: 'right' },
              ]}
              rows={data.followers.map((f) => [
                f.account,
                fmtNum(f.first),
                fmtNum(f.last),
                f.delta === null ? '—' : signed.format(f.delta),
              ])}
            />
          </View>
        ) : null}

        {data.insights.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Uvidi i preporuke</Text>
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
