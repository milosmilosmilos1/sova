import 'server-only'

import { randomUUID } from 'node:crypto'
import { createElement } from 'react'

import { dayLabel } from '@/components/charts/scale'
import { PLATFORMS } from '@/config/platforms'
import { MonthlyReportEmail } from '@/emails/monthly-report'
import { ANALYTICS_TARGET_STATUSES, pctDelta } from '@/lib/analytics/aggregate'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { sendEmail } from '@/lib/email/send'
import { logger } from '@/lib/logger'
import { pluralSr } from '@/lib/plural'
import { renderMonthlyReport, type MonthlyReportData } from '@/lib/reports/monthly-document'
import {
  isMonthlyReportDue,
  monthBounds,
  monthLabel,
  monthName,
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
const num = new Intl.NumberFormat('sr-Latn-RS')

const fmtRate = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })} %`

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

export function reportFileName(brandName: string, month: ReportMonth): string {
  return `izvestaj-${slug(brandName)}-${month}.pdf`
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
  },
): MonthlyReportData {
  const day = new Intl.DateTimeFormat('sr-Latn-RS', {
    day: 'numeric',
    month: 'numeric',
    timeZone: input.timeZone,
  })
  const today = new Intl.DateTimeFormat('sr-Latn-RS', {
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
  return {
    brandName: input.brandName,
    month: monthLabel(input.month),
    previousMonth: monthName(shiftMonth(input.month, -1)),
    generatedAt: today.format(input.now),
    kpis: [
      { label: 'Objave', value: num.format(o.totals.posts), delta: o.deltas.posts },
      { label: 'Doseg', value: num.format(o.totals.reach), delta: o.deltas.reach },
      {
        label: 'Prikazi',
        value: num.format(o.totals.impressions),
        delta: pctDelta(o.totals.impressions, o.previous.impressions),
      },
      { label: 'Angažovanje', value: num.format(o.totals.engagement), delta: o.deltas.engagement },
      {
        label: 'Stopa angažovanja',
        value: fmtRate(o.totals.engagementRate),
        delta: o.deltas.engagementRate,
      },
    ],
    daily: o.daily.map((d) => ({ date: d.date, label: dayLabel(d.date), value: d.reach })),
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
      account: [f.name ?? 'Nalog', f.platform ? PLATFORMS[f.platform]?.label : null]
        .filter(Boolean)
        .join(' · '),
      first: f.first,
      last: f.last,
      delta: f.delta,
    })),
    insights: input.insights.slice(0, 5),
    notes: o.notes,
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
    .select('id, workspace_id, name, timezone, report_emails')
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

async function toView(row: ReportRow, brandName: string): Promise<ReportView> {
  const month = row.period_start.slice(0, 7)
  let url: string | null = null
  if (row.storage_path) {
    const { data } = await createSupabaseAdminClient()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, 3600, { download: reportFileName(brandName, month) })
    url = data?.signedUrl ?? null
  }
  return {
    id: row.id,
    month,
    monthLabel: monthLabel(month),
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
  return toView(row, brand.name)
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
  return Promise.all((data ?? []).map((r) => toView(r, brand.name)))
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

  const label = monthLabel(month)
  const summary = data.empty
    ? null
    : `${num.format(totals.posts)} ${pluralSr(totals.posts, 'objava', 'objave', 'objava')}, doseg ${num.format(totals.reach)}, angažovanje ${num.format(totals.engagement)}`
  const sent: string[] = []
  let failedEmails = 0
  for (const to of brand.report_emails) {
    try {
      await sendEmail({
        to,
        subject: `${brand.name}: izveštaj o društvenim mrežama za ${label}`,
        react: createElement(MonthlyReportEmail, { brandName: brand.name, month: label, summary }),
        attachments: [{ filename: reportFileName(brand.name, month), content: pdf }],
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
