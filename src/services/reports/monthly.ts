import 'server-only'

import { randomUUID } from 'node:crypto'
import { createElement } from 'react'

import { chartNumbers } from '@/components/charts/scale'
import { PLATFORMS } from '@/config/platforms'
import { EMAIL_COPY } from '@/emails/copy'
import { MonthlyReportEmail } from '@/emails/monthly-report'
import type { AppLocale } from '@/i18n/config'
import { translateServerText } from '@/i18n/server-text'
import { ANALYTICS_TARGET_STATUSES, pctDelta } from '@/lib/analytics/aggregate'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { sendEmail } from '@/lib/email/send'
import { logger } from '@/lib/logger'
import { pluralSr } from '@/lib/plural'
import { REPORT_COPY } from '@/lib/reports/copy'
import { renderMonthlyReport, type MonthlyReportData } from '@/lib/reports/monthly-document'
import {
  isMonthlyReportDue,
  monthBounds,
  monthOf,
  previousMonth,
  shiftMonth,
  type MonthBounds,
  type ReportMonth,
} from '@/lib/reports/period'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { computeOverview, type OverviewData } from '@/services/analytics/overview'
import { getBrand } from '@/services/brands'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import type { Database } from '@/types/database'

/**
 * Mesečni PDF izveštaj (D-094): isti brojevi kao strana Analitika, za kalendarski mesec u zoni brenda
 * i poređenje sa celim prethodnim mesecom. Fajl je u privatnom bucketu `exports`, jedan po brendu i
 * mesecu (novo pravljenje zamenjuje fajl). Mesečni posao ga 1. u mesecu šalje vlasniku i
 * administratorima (obaveštenje) i na adrese klijenta iz `brands.report_emails` (PDF u prilogu).
 */
type ReportRow = Database['public']['Tables']['reports']['Row']

const BUCKET = 'exports'
/** izveštaj može da se napravi za poslednjih 12 meseci, kao opseg analitike */
const MONTHS_BACK = 12
/** Jezik izveštaja je jezik brenda (D-130); ćirilica ide kao srpski latinicom. */
export function reportLocale(contentLocale: string | null | undefined): AppLocale {
  return contentLocale === 'en' || contentLocale === 'uk' ? contentLocale : 'sr-Latn'
}

/** „oktobar 2026.”, „October 2026”, „жовтень 2026 р.” */
export function reportMonthLabel(month: ReportMonth, locale: AppLocale): string {
  const [y, m] = month.split('-').map(Number)
  return REPORT_COPY[locale].monthLabel(y!, m!)
}

function formatsFor(locale: AppLocale) {
  const copy = REPORT_COPY[locale]
  const num = new Intl.NumberFormat(copy.intl)
  const pct = (value: string) => (copy.intl === 'en-GB' ? `${value}%` : `${value} %`)
  return {
    num,
    rate: (v: number | null) =>
      v === null ? '—' : pct((v * 100).toLocaleString(copy.intl, { maximumFractionDigits: 1 })),
  }
}

/** Kraći tekst za tabelu: seče na granici reči, sa trotačkom. */
function clip(text: string, max: number): string {
  const flat = text.split(/\s+/).join(' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** kombinujući znakovi (kvačice posle NFD); opseg kroz kodove, da u izvoru nema nevidljivih znakova */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(/đ/g, 'dj')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'brend'
  )
}

export function reportFileName(brandName: string, month: ReportMonth, locale: AppLocale = 'sr-Latn'): string {
  return `${REPORT_COPY[locale].fileStem}-${slug(brandName)}-${month}.pdf`
}

export interface ReportView {
  id: string
  month: ReportMonth
  monthLabel: string
  status: string
  /** potpisan link za preuzimanje (1 h) */
  url: string | null
  /** adrese klijenta kojima je mesečni posao poslao izveštaj; null dok nije poslat */
  sentTo: string[] | null
  createdAt: string
}

/** Podaci za PDF iz analitike meseca. */
export function toReportData(
  o: OverviewData,
  input: {
    brandName: string
    month: ReportMonth
    timeZone: string
    insights: Array<{ claim: string; recommendation: string }>
    now: Date
    locale?: AppLocale
  },
): MonthlyReportData {
  const locale = input.locale ?? 'sr-Latn'
  const copy = REPORT_COPY[locale]
  const { num, rate: fmtRate } = formatsFor(locale)
  const days = chartNumbers(copy.intl)
  const day = new Intl.DateTimeFormat(copy.intl, {
    day: 'numeric',
    month: 'numeric',
    timeZone: input.timeZone,
  })
  const today = new Intl.DateTimeFormat(copy.intl, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: input.timeZone,
  })
  const group = (r: OverviewData['perPillar'][number], label = r.label) => ({
    label,
    posts: r.posts,
    reach: r.reach,
    engagement: r.engagement,
    engagementRate: r.engagementRate,
  })
  const previous = Number(shiftMonth(input.month, -1).slice(5, 7))
  return {
    locale,
    brandName: input.brandName,
    month: reportMonthLabel(input.month, locale),
    previousMonth: copy.monthForComparison(previous),
    generatedAt: today.format(input.now),
    kpis: [
      { label: copy.kpi.posts, value: num.format(o.totals.posts), delta: o.deltas.posts },
      { label: copy.kpi.reach, value: num.format(o.totals.reach), delta: o.deltas.reach },
      {
        label: copy.kpi.impressions,
        value: num.format(o.totals.impressions),
        delta: pctDelta(o.totals.impressions, o.previous.impressions),
      },
      { label: copy.kpi.engagement, value: num.format(o.totals.engagement), delta: o.deltas.engagement },
      {
        label: copy.kpi.rate,
        value: fmtRate(o.totals.engagementRate),
        delta: o.deltas.engagementRate,
      },
    ],
    daily: o.daily.map((d) => ({ date: d.date, label: days.day(d.date), value: d.reach })),
    platforms: o.perPlatform.map((r) => group(r, r.platformLabel)),
    pillars: o.perPillar.map((r) => group(r)),
    topPosts: o.topPosts.slice(0, 5).map((p) => ({
      date: day.format(new Date(p.publishedAt)),
      platform: PLATFORMS[p.platform]?.label ?? p.platform,
      excerpt: clip(p.excerpt || p.title || '', 110),
      reach: p.reach,
      engagement: p.engagement,
      engagementRate: p.engagementRate,
    })),
    followers: o.followers.map((f) => ({
      account: [f.name ?? copy.accountFallback, f.platform ? PLATFORMS[f.platform]?.label : null]
        .filter(Boolean)
        .join(' · '),
      first: f.first,
      last: f.last,
      delta: f.delta,
    })),
    insights: input.insights.slice(0, 5),
    notes: o.notes.map((n) => translateServerText(n, locale)),
    empty: o.totals.posts === 0,
  }
}

/** AI uvidi čiji se period preklapa sa mesecom, najnoviji prvi, bez ponavljanja iste tvrdnje. */
async function loadInsights(
  brandId: string,
  bounds: MonthBounds,
): Promise<Array<{ claim: string; recommendation: string }>> {
  const { data } = await createSupabaseAdminClient()
    .from('insights')
    .select('items')
    .eq('brand_id', brandId)
    .lte('period_start', bounds.periodEnd)
    .gte('period_end', bounds.periodStart)
    .order('created_at', { ascending: false })
    .limit(6)
  const seen = new Set<string>()
  const out: Array<{ claim: string; recommendation: string }> = []
  for (const row of data ?? []) {
    const items = (Array.isArray(row.items) ? row.items : []) as Array<{
      claim?: unknown
      recommendation?: unknown
    }>
    for (const i of items) {
      if (typeof i.claim !== 'string' || typeof i.recommendation !== 'string' || seen.has(i.claim)) continue
      seen.add(i.claim)
      out.push({ claim: i.claim, recommendation: i.recommendation })
      if (out.length === 5) return out
    }
  }
  return out
}

interface ReportBrand {
  id: string
  workspace_id: string
  name: string
  timezone: string
  report_emails: string[]
  content_locale: string
}

interface Generated {
  row: ReportRow
  pdf: Buffer
  data: MonthlyReportData
  brand: ReportBrand
  totals: OverviewData['totals']
}

/** Pravi PDF i upisuje ga (service role); poziva se posle provere pristupa ili iz mesečnog posla. */
export async function generateMonthlyReport(input: {
  brandId: string
  month: ReportMonth
  createdBy: string | null
  now?: Date
}): Promise<Generated> {
  const now = input.now ?? new Date()
  const admin = createSupabaseAdminClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, workspace_id, name, timezone, report_emails, content_locale')
    .eq('id', input.brandId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!brand) throw new ApiError('NOT_FOUND', 'Brend ne postoji ili nemate pristup.')
  const bounds = monthBounds(input.month, brand.timezone)
  const prev = monthBounds(shiftMonth(input.month, -1), brand.timezone)
  const overview = await computeOverview(admin, brand.id, bounds.from, bounds.to, brand.timezone, {
    from: prev.from,
    to: prev.to,
  })
  const data = toReportData(overview, {
    brandName: brand.name,
    month: input.month,
    timeZone: brand.timezone,
    insights: await loadInsights(brand.id, bounds),
    now,
    locale: reportLocale(brand.content_locale),
  })
  const pdf = await renderMonthlyReport(data)
  // nov naziv pri svakom pravljenju: stari link ne sme da vrati stari fajl iz keša
  const path = `ws/${brand.workspace_id}/reports/${brand.id}/${input.month}-${randomUUID().slice(0, 8)}.pdf`
  const upload = await admin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (upload.error) throw new ApiError('INTERNAL', 'Čuvanje izveštaja nije uspelo.', { cause: upload.error })
  const { data: existing } = await admin
    .from('reports')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('period_start', bounds.periodStart)
    .eq('period_end', bounds.periodEnd)
    .maybeSingle()
  const saved = existing
    ? await admin
        .from('reports')
        .update({
          storage_path: path,
          status: existing.status === 'sent' ? 'sent' : 'ready',
          created_by: input.createdBy ?? existing.created_by,
          created_at: now.toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()
    : await admin
        .from('reports')
        .insert({
          workspace_id: brand.workspace_id,
          brand_id: brand.id,
          period_start: bounds.periodStart,
          period_end: bounds.periodEnd,
          status: 'ready',
          storage_path: path,
          created_by: input.createdBy,
        })
        .select('*')
        .single()
  if (saved.error || !saved.data) {
    await admin.storage.from(BUCKET).remove([path])
    throw mapDbError(saved.error, 'Zapis o izveštaju nije sačuvan.')
  }
  if (existing?.storage_path && existing.storage_path !== path)
    await admin.storage.from(BUCKET).remove([existing.storage_path])
  return { row: saved.data, pdf, data, brand, totals: overview.totals }
}

/** Izveštaj u aplikaciji: mesec na jeziku korisnika, fajl na jeziku brenda (D-130). */
async function toView(
  row: ReportRow,
  brand: { name: string; content_locale: string },
  locale: AppLocale,
): Promise<ReportView> {
  const month = row.period_start.slice(0, 7)
  let url: string | null = null
  if (row.storage_path) {
    const { data } = await createSupabaseAdminClient()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, 3600, {
        download: reportFileName(brand.name, month, reportLocale(brand.content_locale)),
      })
    url = data?.signedUrl ?? null
  }
  return {
    id: row.id,
    month,
    monthLabel: reportMonthLabel(month, locale),
    status: row.status,
    url,
    sentTo: row.sent_to,
    createdAt: row.created_at,
  }
}

/** Izveštaj na zahtev (dugme u Analitici): tekući mesec ili do 11 meseci unazad. */
export async function createReport(
  viewer: Viewer,
  input: { brandId: string; month: ReportMonth },
): Promise<ReportView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id)
  const current = monthOf(new Date(), brand.timezone)
  if (input.month > current) throw new ApiError('VALIDATION', 'Izveštaj se pravi za tekući ili raniji mesec.')
  if (input.month < shiftMonth(current, -(MONTHS_BACK - 1)))
    throw new ApiError('VALIDATION', `Izveštaj može da se napravi za poslednjih ${MONTHS_BACK} meseci.`)
  const { row } = await generateMonthlyReport({
    brandId: brand.id,
    month: input.month,
    createdBy: viewer.user.id,
  })
  return toView(row, brand, viewer.profile.locale)
}

export async function listReports(viewer: Viewer, brandId: string): Promise<ReportView[]> {
  const brand = await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('reports')
    .select('*')
    .eq('brand_id', brandId)
    .order('period_start', { ascending: false })
    .limit(24)
  if (error) throw mapDbError(error)
  return Promise.all((data ?? []).map((r) => toView(r, brand, viewer.profile.locale)))
}

export interface DueReport {
  brandId: string
  month: ReportMonth
}

/**
 * Brendovi kojima je po njihovoj zoni 1. u mesecu od 06:00 (ili 2. dan), sa bar jednom objavom u
 * prethodnom mesecu, a izveštaj za taj mesec još nije poslat (`sent_to` je oznaka slanja).
 */
export async function listDueMonthlyReports(
  now = new Date(),
  scope: { brandId?: string } = {},
): Promise<DueReport[]> {
  const admin = createSupabaseAdminClient()
  let query = admin.from('brands').select('id, timezone').eq('status', 'active').is('deleted_at', null)
  if (scope.brandId) query = query.eq('id', scope.brandId)
  const { data: brands, error } = await query.limit(5000)
  if (error) throw mapDbError(error)
  const due: DueReport[] = []
  for (const b of brands ?? []) {
    if (!isMonthlyReportDue(now, b.timezone)) continue
    const month = previousMonth(now, b.timezone)
    const bounds = monthBounds(month, b.timezone)
    const { count } = await admin
      .from('post_targets')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', b.id)
      .in('status', [...ANALYTICS_TARGET_STATUSES])
      .gte('published_at', bounds.from)
      .lte('published_at', bounds.to)
    if (!count) continue
    const { data: existing } = await admin
      .from('reports')
      .select('sent_to')
      .eq('brand_id', b.id)
      .eq('period_start', bounds.periodStart)
      .eq('period_end', bounds.periodEnd)
      .maybeSingle()
    if (existing?.sent_to) continue
    due.push({ brandId: b.id, month })
  }
  return due
}

export interface DeliveryResult {
  status: 'sent' | 'skipped'
  reportId: string | null
  emailed: number
  failedEmails: number
}

/**
 * Pravi izveštaj i šalje ga. Oznaka slanja se upisuje pre emailova: posao koji padne posle slanja
 * ne sme klijentu da pošalje isti izveštaj dvaput (radije jedan propušten email nego duplikat).
 */
export async function deliverMonthlyReport(brandId: string, month: ReportMonth): Promise<DeliveryResult> {
  const admin = createSupabaseAdminClient()
  const { row, pdf, data, brand, totals } = await generateMonthlyReport({ brandId, month, createdBy: null })
  const claimed = await admin
    .from('reports')
    .update({ status: 'sent', sent_to: [] })
    .eq('id', row.id)
    .is('sent_to', null)
    .select('id')
    .maybeSingle()
  if (claimed.error) throw mapDbError(claimed.error)
  if (!claimed.data) return { status: 'skipped', reportId: row.id, emailed: 0, failedEmails: 0 }

  // klijent dobija izveštaj na jeziku brenda (D-130)
  const locale = reportLocale(brand.content_locale)
  const { num } = formatsFor(locale)
  const label = reportMonthLabel(month, locale)
  const summary = data.empty
    ? null
    : REPORT_COPY[locale].summary(
        totals.posts,
        num.format(totals.posts),
        num.format(totals.reach),
        num.format(totals.engagement),
      )
  const sent: string[] = []
  let failedEmails = 0
  for (const to of brand.report_emails) {
    try {
      await sendEmail({
        to,
        subject: EMAIL_COPY[locale].reportPreview(brand.name, label),
        react: createElement(MonthlyReportEmail, { brandName: brand.name, month: label, summary, locale }),
        attachments: [{ filename: reportFileName(brand.name, month, locale), content: pdf }],
        tags: { type: 'monthly_report' },
      })
      sent.push(to)
    } catch (error) {
      failedEmails += 1
      logger.warn('monthly_report_email_failed', { reportId: row.id, error })
    }
  }
  if (sent.length) await admin.from('reports').update({ sent_to: sent }).eq('id', row.id)

  const owners = await usersWithRoles(brand.workspace_id, brand.id, ['owner', 'admin'])
  await notifyUsers({
    userIds: owners,
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    type: 'report_ready',
    title: `Mesečni izveštaj za ${label}`,
    body: sent.length
      ? `${brand.name}: PDF je spreman i poslat klijentu na ${sent.length} ${pluralSr(sent.length, 'adresu', 'adrese', 'adresa')}.`
      : `${brand.name}: PDF je spreman u Analitici.`,
    link: '/app/analytics',
    data: { reportId: row.id, month },
  })
  return { status: 'sent', reportId: row.id, emailed: sent.length, failedEmails }
}

/** Ceo mesečni prolaz bez Inngest-a (testovi i ručno pokretanje). */
export async function runMonthlyReports(
  now = new Date(),
  scope: { brandId?: string } = {},
): Promise<{ due: number; sent: number; failed: number }> {
  const due = await listDueMonthlyReports(now, scope)
  const summary = { due: due.length, sent: 0, failed: 0 }
  for (const d of due) {
    try {
      const r = await deliverMonthlyReport(d.brandId, d.month)
      if (r.status === 'sent') summary.sent += 1
    } catch (error) {
      summary.failed += 1
      logger.error('monthly_report_failed', { brandId: d.brandId, month: d.month, error })
    }
  }
  logger.info('monthly_reports', summary)
  return summary
}
