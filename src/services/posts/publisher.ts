import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import type { NotificationType } from '@/config/notifications'
import { providerFor } from '@/integrations/social/registry'
import { pollHandleId, type NormalizedPost, type PollHandle } from '@/integrations/social/types'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import {
  ASYNC_POLL_INTERVAL_MS,
  ASYNC_POLL_MAX,
  DAILY_PUBLISH_LIMITS,
  MAX_PUBLISH_ATTEMPTS,
  MEDIA_URL_TTL_SEC,
  PUBLISHED_LIKE,
  STUCK_PUBLISHING_MS,
  WATCHDOG_ALARM_MS,
  WATCHDOG_LATE_MS,
  WATCHDOG_RESEND_COOLDOWN_MS,
  classifyPublishError,
  nextDaySameTime,
  nextFullMinute,
  retryDelayMs,
  rollupPostStatus,
  sameMinute,
  type ClassifiedFailure,
} from '@/lib/posts/publish-rules'
import type { PostStatus, TargetStatus } from '@/lib/posts/state-machine'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { signedUrl, type MediaAssetRow } from '@/services/media'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import { getPostView, loadPost, type PostRow, type PostView, type TargetRow } from '@/services/posts/posts'
import { markAccountStatus, refFor, type SocialAccountRow } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'
import { publicMediaUrl, type MediaVariant } from '@/lib/media/public-url'
import { getTokenPrice } from '@/lib/tokens/prices'
import { containsUrl } from '@/lib/x-text'
import { confirmReservation, releaseReservation, reserveTokens } from '@/lib/tokens/reservation'
import type { Database, Json } from '@/types/database'

/**
 * Publisher (faza 9b, ARCHITECTURE 3.3). Jedan run po targetu: spava do termina, ponovo proverava
 * (nalog, brend, mediji, dnevni limit), zaključava target (`publishing`), objavljuje kroz
 * SocialProvider sa najviše 3 pokušaja (pauze 1/5/15 min), prati IG kontejner, piše
 * `publish_attempts`, izvodi status objave iz targeta i šalje obaveštenja.
 *
 * Svaka funkcija koju Inngest izvršava kao step prima samo ID-jeve i vraća mali, serijalizabilan
 * rezultat; unutar step-a nema drugih step-ova (sleep i sendEvent su u orkestraciji ispod).
 */
export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>

export interface PublishJob {
  targetId: string
  scheduledAt: string
  version: number
}

export type OutgoingEvent =
  | { kind: 'scheduled'; targetId: string; scheduledAt: string; version: number; socialAccountId: string }
  | { kind: 'published'; targetId: string; socialAccountId: string; brandId: string }

export interface PublishContext {
  run: StepRunner
  sleepUntil: (name: string, at: Date) => Promise<void>
  sleep: (name: string, ms: number) => Promise<void>
  sendEvent: (name: string, event: OutgoingEvent) => Promise<void>
  runId: string | null
  now?: () => Date
}

export type PublishOutcome =
  'published' | 'assisted' | 'needs_reauth' | 'failed' | 'rescheduled' | 'skipped' | 'paused'

export interface PublishReport {
  outcome: PublishOutcome
  targetId: string
  externalId: string | null
  message: string | null
  attempts: number
}

type BrandLite = Pick<
  Database['public']['Tables']['brands']['Row'],
  'id' | 'name' | 'status' | 'timezone' | 'workspace_id' | 'content_locale'
>
type TargetUpdate = Database['public']['Tables']['post_targets']['Update']

interface Bundle {
  target: TargetRow
  post: PostRow
  account: SocialAccountRow
  brand: BrandLite
  media: Array<{ sortOrder: number; asset: MediaAssetRow }>
  campaign: { name: string; utm_campaign: string | null } | null
  /** redova u post_media čiji medij više ne postoji (obrisan) */
  missingMedia: number
}

let dailyLimitsOverride: Partial<Record<SocialPlatform, number>> | null = null

/** Testovi: manji dnevni limiti da bi se pomeranje termina proverilo bez 100 objava. */
export function setDailyLimitsForTests(limits: Partial<Record<SocialPlatform, number>> | null): void {
  dailyLimitsOverride = limits
}

function dailyLimitFor(platform: SocialPlatform): number | null {
  return (dailyLimitsOverride ?? DAILY_PUBLISH_LIMITS)[platform] ?? null
}

const SYSTEM_ACTOR = null as unknown as string
const NO_VERSION_CHECK = null as unknown as number

function fmt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(
    date,
  )
}

// ---------------------------------------------------------------------------
// Učitavanje
// ---------------------------------------------------------------------------

async function loadBundle(targetId: string): Promise<Bundle | null> {
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin.from('post_targets').select('*').eq('id', targetId).maybeSingle()
  if (!target) return null
  const [{ data: post }, { data: account }, { data: brand }] = await Promise.all([
    admin.from('posts').select('*').eq('id', target.post_id).maybeSingle(),
    admin.from('social_accounts').select('*').eq('id', target.social_account_id).maybeSingle(),
    admin
      .from('brands')
      .select('id, name, status, timezone, workspace_id, content_locale')
      .eq('id', target.brand_id)
      .maybeSingle(),
  ])
  if (!post || !account || !brand) return null
  const { data: links } = await admin
    .from('post_media')
    .select('media_asset_id, sort_order, target_id')
    .eq('post_id', post.id)
    .or(`target_id.is.null,target_id.eq.${targetId}`)
    .order('sort_order', { ascending: true })
  const ids = [...new Set((links ?? []).map((l) => l.media_asset_id))]
  const assets = ids.length
    ? ((await admin.from('media_assets').select('*').in('id', ids).is('deleted_at', null)).data ?? [])
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))
  const media: Bundle['media'] = []
  let missing = 0
  for (const l of links ?? []) {
    const asset = byId.get(l.media_asset_id)
    if (asset) media.push({ sortOrder: l.sort_order, asset })
    else missing += 1
  }
  let campaign: Bundle['campaign'] = null
  if (post.campaign_id) {
    const { data: c } = await admin
      .from('campaigns')
      .select('name, utm_campaign')
      .eq('id', post.campaign_id)
      .maybeSingle()
    campaign = c ?? null
  }
  return { target, post, account, brand, media, missingMedia: missing, campaign }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** UTM (brif 10): izvor = mreža, medium = social, kampanja = kampanja iz strategije; ručni UTM objave ima prednost. */
export function withUtm(
  link: string | null,
  utm: Json | null,
  defaults: Record<string, string> = {},
): string | null {
  if (!link) return link
  const explicit = utm && typeof utm === 'object' && !Array.isArray(utm) ? (utm as Record<string, Json>) : {}
  try {
    const url = new URL(link)
    for (const [k, v] of Object.entries(defaults)) {
      if (v && !url.searchParams.has(k)) url.searchParams.set(k, v)
    }
    for (const [k, v] of Object.entries(explicit)) {
      if (typeof v === 'string' && v) url.searchParams.set(k.startsWith('utm_') ? k : `utm_${k}`, v)
    }
    return url.toString()
  } catch {
    return link
  }
}

function publicVariant(platform: SocialPlatform, kind: string): MediaVariant {
  if (kind !== 'image') return 'orig'
  if (platform === 'tiktok') return 'tiktok'
  return platform === 'pinterest' || platform === 'google_business' ? 'jpeg' : 'orig'
}

async function normalize(b: Bundle): Promise<NormalizedPost> {
  const media: NormalizedPost['media'] = []
  for (const m of b.media) {
    media.push({
      url: await signedUrl(m.asset, MEDIA_URL_TTL_SEC),
      mimeType: m.asset.mime_type,
      width: m.asset.width,
      height: m.asset.height,
      alt: m.asset.alt_text,
      assetId: m.asset.id,
      // TikTok foto preuzima samo sa verifikovanog domena; JPEG do 1080p (D-077); Pinterest i Google ne primaju WebP
      publicUrl: publicMediaUrl(m.asset.id, publicVariant(b.target.platform, m.asset.kind)),
      sizeBytes: m.asset.size_bytes,
      durationMs: m.asset.duration_ms,
    })
  }
  return {
    text: b.target.text_content || b.post.master_text,
    link: withUtm(b.post.link_url, b.post.utm, {
      utm_source: b.target.platform,
      utm_medium: 'social',
      utm_campaign: b.campaign ? b.campaign.utm_campaign || slug(b.campaign.name) : 'sova',
    }),
    media,
    firstComment: b.post.first_comment,
    isAiGenerated: b.media.some((m) => m.asset.is_ai_generated),
    clientKey: b.target.idempotency_key,
    title: b.post.title,
    options: (b.target.options as Record<string, Json> | null) ?? {},
    language: b.brand.content_locale === 'en' ? 'en' : 'sr',
  }
}

// ---------------------------------------------------------------------------
// Upisi
// ---------------------------------------------------------------------------

async function moveTarget(
  targetId: string,
  from: TargetStatus | TargetStatus[],
  to: TargetStatus,
  patch: TargetUpdate = {},
): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  let q = admin
    .from('post_targets')
    .update({ status: to, ...patch })
    .eq('id', targetId)
  q = Array.isArray(from) ? q.in('status', from) : q.eq('status', from)
  const { data, error } = await q.select('id')
  if (error) throw mapDbError(error)
  return (data?.length ?? 0) > 0
}

async function transitionPostService(postId: string, to: PostStatus, summary: string): Promise<boolean> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.rpc('transition_post', {
    p_post_id: postId,
    p_to: to,
    p_expected_version: NO_VERSION_CHECK,
    p_actor: SYSTEM_ACTOR,
    p_summary: summary,
  })
  if (error) {
    logger.warn('publisher_post_transition_failed', { postId, to, error: error.message })
    return false
  }
  return true
}

const ROLLUP_SUMMARY: Record<string, string> = {
  publishing: 'objavljivanje počelo',
  scheduled: 'čeka novi pokušaj',
  published: 'objavljeno na svim mrežama',
  failed: 'objavljivanje nije uspelo',
  partially_published: 'objavljeno delimično',
}

/** Status objave iz statusa targeta (K12); prelazi idu kroz `transition_post` (service role). */
export async function rollupPost(postId: string): Promise<PostStatus | null> {
  const admin = createSupabaseAdminClient()
  const { data: post } = await admin.from('posts').select('id, status').eq('id', postId).maybeSingle()
  if (!post) return null
  const { data: targets } = await admin.from('post_targets').select('status').eq('post_id', postId)
  const next = rollupPostStatus((targets ?? []).map((t) => t.status))
  if (!next || next === post.status) return post.status
  const tx = (to: PostStatus) => transitionPostService(postId, to, ROLLUP_SUMMARY[to] ?? to)
  if (next === 'publishing') {
    if (post.status === 'scheduled') await tx('publishing')
    return next
  }
  if (next === 'scheduled') {
    if (post.status === 'publishing') await tx('scheduled')
    return next
  }
  if (post.status === 'scheduled') await tx('publishing')
  if (post.status === 'scheduled' || post.status === 'publishing' || post.status === 'partially_published') {
    await tx(next)
  }
  return next
}

async function recordAttempt(
  b: Bundle,
  attemptNo: number,
  startedAt: Date,
  outcome: 'success' | 'retryable_error' | 'permanent_error' | 'skipped',
  failure: ClassifiedFailure | null,
  response: Json | null,
  runId: string | null,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('publish_attempts').insert({
    target_id: b.target.id,
    brand_id: b.brand.id,
    attempt_no: attemptNo,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    outcome,
    http_status: failure?.httpStatus ?? null,
    error_code: failure?.code ?? null,
    error_message: failure ? failure.detail.slice(0, 1000) : null,
    response_excerpt: response,
    inngest_run_id: runId,
  })
  if (error) logger.warn('publish_attempt_insert_failed', { targetId: b.target.id, error: error.message })
}

async function notifyPost(
  b: Bundle,
  type: NotificationType,
  title: string,
  body: string | null,
  opts: { admins?: boolean; email?: boolean } = {},
): Promise<void> {
  const ids = b.post.created_by ? [b.post.created_by] : []
  if (opts.admins) ids.push(...(await usersWithRoles(b.brand.workspace_id, b.brand.id, ['owner', 'admin'])))
  await notifyUsers({
    userIds: ids,
    workspaceId: b.brand.workspace_id,
    brandId: b.brand.id,
    type,
    title,
    body,
    link: `/app/posts/${b.post.id}`,
    data: { postId: b.post.id, targetId: b.target.id, platform: b.target.platform },
    ...(opts.email !== undefined ? { email: opts.email } : {}),
  })
}

async function finalizeSuccess(
  b: Bundle,
  attemptNo: number,
  startedAt: Date,
  externalId: string | null,
  permalink: string | null,
  runId: string | null,
  note: string | null,
): Promise<void> {
  const publishedAt = new Date()
  const latency = b.target.scheduled_at
    ? Math.max(0, publishedAt.getTime() - new Date(b.target.scheduled_at).getTime())
    : null
  await moveTarget(b.target.id, ['publishing', 'scheduled'], 'published', {
    external_post_id: externalId,
    permalink,
    published_at: publishedAt.toISOString(),
    publish_latency_ms: latency,
    last_error_code: externalId ? null : 'NO_EXTERNAL_ID',
    last_error_message: externalId ? null : (note ?? 'Mreža nije vratila ID objave; proverite je ručno.'),
  })
  await recordAttempt(b, attemptNo, startedAt, 'success', null, { externalId, permalink, note }, runId)
  await rollupPost(b.post.id)
  await notifyPost(
    b,
    'post_published',
    'Objava je objavljena',
    `${b.account.name} (${b.target.platform})${permalink ? `: ${permalink}` : ''}`,
  )
  logger.info('target_published', {
    targetId: b.target.id,
    platform: b.target.platform,
    externalId,
    latencyMs: latency,
    attempt: attemptNo,
  })
}

async function failTarget(
  b: Bundle,
  attemptNo: number,
  startedAt: Date,
  failure: ClassifiedFailure,
  runId: string | null,
  notifyType: NotificationType = 'post_failed',
): Promise<void> {
  await moveTarget(b.target.id, ['publishing', 'scheduled'], 'failed', {
    last_error_code: failure.code,
    last_error_message: failure.message,
  })
  await recordAttempt(b, attemptNo, startedAt, 'permanent_error', failure, null, runId)
  await rollupPost(b.post.id)
  const titles: Partial<Record<NotificationType, string>> = {
    post_failed: 'Objava nije uspela',
    post_needs_reauth: 'Nalog traži ponovno povezivanje',
  }
  await notifyPost(
    b,
    notifyType,
    titles[notifyType] ?? 'Objava nije uspela',
    `${b.account.name}: ${failure.message}`,
    {
      admins: true,
    },
  )
  logger.warn('target_failed', {
    targetId: b.target.id,
    code: failure.code,
    detail: failure.detail,
    attempt: attemptNo,
  })
}

// ---------------------------------------------------------------------------
// Koraci
// ---------------------------------------------------------------------------

function matchesJob(b: Bundle, job: PublishJob): boolean {
  return b.target.status === 'scheduled' && sameMinute(b.target.scheduled_at, job.scheduledAt)
}

type Decision =
  | { action: 'go' }
  | { action: 'skip'; reason: string }
  | { action: 'paused' | 'needs_reauth' | 'assisted' | 'failed'; message: string }
  | { action: 'reschedule'; at: string; socialAccountId: string; version: number; message: string }

async function dailyPublished(accountId: string, now: Date): Promise<number> {
  const admin = createSupabaseAdminClient()
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const { count } = await admin
    .from('post_targets')
    .select('id', { count: 'exact', head: true })
    .eq('social_account_id', accountId)
    .in('status', [...PUBLISHED_LIKE])
    .gte('published_at', since)
  return count ?? 0
}

/** Pomeranje termina na slobodan minut od `at` (isti minut po nalogu je zabranjen, K8). */
async function rescheduleTo(
  b: Bundle,
  from: TargetStatus,
  at: Date,
  code: string,
  message: string,
): Promise<Date | null> {
  const admin = createSupabaseAdminClient()
  let when = at
  for (let i = 0; i < 60; i++) {
    const { data, error } = await admin
      .from('post_targets')
      .update({
        status: 'scheduled',
        scheduled_at: when.toISOString(),
        last_error_code: code,
        last_error_message: message,
      })
      .eq('id', b.target.id)
      .eq('status', from)
      .select('id')
    if (!error) return data?.length ? when : null
    if (error.code === '23505') {
      when = new Date(when.getTime() + 60_000)
      continue
    }
    throw mapDbError(error)
  }
  return null
}

async function recheck(job: PublishJob, runId: string | null, now: Date): Promise<Decision> {
  const b = await loadBundle(job.targetId)
  if (!b) return { action: 'skip', reason: 'target ne postoji' }
  if (!matchesJob(b, job))
    return { action: 'skip', reason: `target je ${b.target.status}, termin ${b.target.scheduled_at}` }
  if (b.post.deleted_at) return { action: 'skip', reason: 'objava je obrisana' }

  if (b.brand.status !== 'active') {
    const message = 'Brend je pauziran pa objava nije poslata. Nastavite objavu kad brend bude aktivan.'
    await moveTarget(b.target.id, 'scheduled', 'paused', {
      last_error_code: 'BRAND_PAUSED',
      last_error_message: message,
    })
    if (b.post.status === 'scheduled') await transitionPostService(b.post.id, 'paused', 'brend pauziran')
    await notifyPost(b, 'post_failed', 'Objava je pauzirana', message, { admins: true })
    return { action: 'paused', message }
  }

  if (b.account.status !== 'active') {
    const message =
      b.account.status === 'needs_reauth'
        ? 'Veza sa mrežom je istekla. Povežite nalog ponovo pa pokušajte objavu.'
        : `Nalog nije aktivan (${b.account.status}). Proverite nalog u Mrežama.`
    await moveTarget(b.target.id, 'scheduled', 'needs_reauth', {
      last_error_code: 'ACCOUNT_INACTIVE',
      last_error_message: message,
      last_attempt_at: now.toISOString(),
      inngest_run_id: runId,
    })
    await notifyPost(
      b,
      'post_needs_reauth',
      'Nalog traži ponovno povezivanje',
      `${b.account.name}: ${message}`,
      {
        admins: true,
      },
    )
    return { action: 'needs_reauth', message }
  }

  const caps = (b.account.capabilities as Record<string, Json> | null) ?? {}
  if (b.account.assisted_only || caps.publish === false) {
    const message =
      'Ova mreža se objavljuje ručno: kopirajte tekst i medije iz Sove, pa označite objavu kao objavljenu.'
    await moveTarget(b.target.id, 'scheduled', 'assisted_pending', {
      assisted: true,
      last_error_code: null,
      last_error_message: null,
      last_attempt_at: now.toISOString(),
      inngest_run_id: runId,
    })
    await notifyPost(
      b,
      'post_assisted_pending',
      'Objava čeka ručno objavljivanje',
      `${b.account.name}: ${message}`,
    )
    return { action: 'assisted', message }
  }

  if (b.missingMedia > 0) {
    const failure: ClassifiedFailure = {
      kind: 'permanent',
      code: 'MEDIA_MISSING',
      message: 'Medij objave je obrisan iz biblioteke. Dodajte novi medij pa zakažite ponovo.',
      detail: `${b.missingMedia} post_media bez media_assets`,
      httpStatus: null,
    }
    await moveTarget(b.target.id, 'scheduled', 'publishing', {
      attempt_count: b.target.attempt_count + 1,
      last_attempt_at: now.toISOString(),
      inngest_run_id: runId,
    })
    if (b.post.status === 'scheduled')
      await transitionPostService(b.post.id, 'publishing', ROLLUP_SUMMARY.publishing!)
    await failTarget(b, b.target.attempt_count + 1, now, failure, runId)
    return { action: 'failed', message: failure.message }
  }

  const limit = dailyLimitFor(b.target.platform)
  if (limit !== null && (await dailyPublished(b.account.id, now)) >= limit) {
    const message = `Dnevni limit od ${limit} objava na mreži ${b.target.platform} je potrošen; termin je pomeren za 24 h.`
    const when = await rescheduleTo(
      b,
      'scheduled',
      nextDaySameTime(new Date(job.scheduledAt)),
      'QUOTA_EXCEEDED',
      message,
    )
    if (!when) return { action: 'skip', reason: 'target promenjen tokom pomeranja' }
    await notifyPost(
      b,
      'post_rescheduled',
      'Objava je pomerena',
      `${b.account.name}: ${message} Novi termin: ${fmt(when, b.brand.timezone)}.`,
      {
        admins: true,
      },
    )
    return {
      action: 'reschedule',
      at: when.toISOString(),
      socialAccountId: b.account.id,
      version: b.post.version,
      message,
    }
  }

  return { action: 'go' }
}

/**
 * X je pay-per-use (D-013): objava troši 1 token, a sa linkom 6 (X naplaćuje objavu sa URL-om
 * $0.20). Rezervacija pre slanja, potvrda posle uspeha, oslobađanje pri grešci; rok rezervacije 60 min
 * pokriva i obradu videa.
 */
export function xChargeAction(post: Pick<NormalizedPost, 'text' | 'link'>): 'x_post' | 'x_post_with_link' {
  // X sam pretvara i domen bez https:// u link, pa i on menja cenu
  return post.link || containsUrl(post.text) ? 'x_post_with_link' : 'x_post'
}

async function reservePublishCharge(b: Bundle, post: NormalizedPost): Promise<string | null> {
  if (b.target.platform !== 'x') return null
  const amount = await getTokenPrice(xChargeAction(post))
  if (amount <= 0) return null
  return reserveTokens({
    workspaceId: b.post.workspace_id,
    brandId: b.brand.id,
    userId: b.post.created_by,
    amount,
    ttlMinutes: 60,
  })
}

async function settleCharge(
  charge: string | null,
  outcome: 'confirm' | 'release',
  reason = 'publish',
): Promise<void> {
  if (!charge) return
  try {
    if (outcome === 'confirm') await confirmReservation(charge)
    else await releaseReservation(charge, reason)
  } catch (error) {
    logger.error('publish_charge_settle_failed', { charge, outcome, error })
  }
}

type AttemptResult =
  | { kind: 'success'; externalId: string | null; socialAccountId: string; brandId: string }
  | {
      kind: 'pending'
      handle: PollHandle
      socialAccountId: string
      brandId: string
      /** rezervacija tokena (X) koja se potvrđuje ili oslobađa posle obrade */
      charge: string | null
    }
  | { kind: 'retry'; delayMs: number; message: string }
  | { kind: 'reschedule'; at: string; socialAccountId: string; version: number; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'skipped'; reason: string }

async function attemptOnce(
  job: PublishJob,
  attemptNo: number,
  runId: string | null,
  now: Date,
): Promise<AttemptResult> {
  const b = await loadBundle(job.targetId)
  if (!b) return { kind: 'skipped', reason: 'target ne postoji' }
  if (b.target.status !== 'scheduled' || !sameMinute(b.target.scheduled_at, job.scheduledAt)) {
    return { kind: 'skipped', reason: `target je ${b.target.status}` }
  }
  // zaključavanje: samo jedan run sme da pređe scheduled → publishing
  const locked = await moveTarget(b.target.id, 'scheduled', 'publishing', {
    attempt_count: b.target.attempt_count + 1,
    last_attempt_at: now.toISOString(),
    inngest_run_id: runId,
  })
  if (!locked) return { kind: 'skipped', reason: 'drugi run je preuzeo target' }
  b.target.status = 'publishing'
  b.target.attempt_count += 1
  if (b.post.status === 'scheduled')
    await transitionPostService(b.post.id, 'publishing', ROLLUP_SUMMARY.publishing!)

  const startedAt = new Date()
  const provider = providerFor(b.target.platform)
  const ref = refFor(b.account)
  const ids = { socialAccountId: b.account.id, brandId: b.brand.id }
  let token: string
  try {
    token = await accessTokenFor(b.account)
  } catch (error) {
    const failure = classifyPublishError(error)
    if (failure.kind === 'reauth') {
      await markAccountStatus(b.account.id, 'needs_reauth', failure.code, failure.detail)
      await failTarget(b, attemptNo, startedAt, failure, runId, 'post_needs_reauth')
    } else {
      await failTarget(b, attemptNo, startedAt, failure, runId)
    }
    return { kind: 'failed', message: failure.message }
  }

  let normalized: NormalizedPost
  try {
    normalized = await normalize(b)
  } catch (error) {
    const failure = classifyPublishError(error)
    await failTarget(b, attemptNo, startedAt, failure, runId)
    return { kind: 'failed', message: failure.message }
  }

  // posle pada ili privremene greške: da li je objava ipak prošla? (N5)
  if (attemptNo > 1) {
    try {
      const existing = await provider.findExistingPost(normalized, ref, token)
      if (existing) {
        try {
          await settleCharge(await reservePublishCharge(b, normalized), 'confirm')
        } catch (error) {
          logger.warn('publish_charge_existing_failed', { targetId: b.target.id, error })
        }
        await finalizeSuccess(
          b,
          attemptNo,
          startedAt,
          existing,
          null,
          runId,
          'nađeno kod mreže pre ponovnog slanja',
        )
        return { kind: 'success', externalId: existing, ...ids }
      }
    } catch (error) {
      logger.warn('find_existing_post_failed', { targetId: b.target.id, error })
    }
  }

  let charge: string | null = null
  try {
    charge = await reservePublishCharge(b, normalized)
  } catch (error) {
    const failure: ClassifiedFailure =
      error instanceof ApiError && error.code === 'INSUFFICIENT_TOKENS'
        ? {
            kind: 'permanent',
            code: 'INSUFFICIENT_TOKENS',
            message: `Nema dovoljno tokena za objavu na X (${
              xChargeAction(normalized) === 'x_post_with_link' ? 'objava sa linkom' : 'objava'
            }). Dopunite tokene pa objavite ponovo.`,
            detail: error.message,
            httpStatus: null,
          }
        : classifyPublishError(error)
    await failTarget(b, attemptNo, startedAt, failure, runId)
    return { kind: 'failed', message: failure.message }
  }

  try {
    const result = await provider.publish(normalized, ref, token)
    if (result.pending) {
      await recordAttempt(
        b,
        attemptNo,
        startedAt,
        'success',
        null,
        { pending: pollHandleId(result.pending) },
        runId,
      )
      return { kind: 'pending', handle: result.pending, ...ids, charge }
    }
    await settleCharge(charge, 'confirm')
    await finalizeSuccess(b, attemptNo, startedAt, result.externalId, result.permalink, runId, null)
    return { kind: 'success', externalId: result.externalId, ...ids }
  } catch (error) {
    const failure = classifyPublishError(error)
    await settleCharge(charge, 'release', failure.code)
    switch (failure.kind) {
      case 'retry': {
        if (attemptNo >= MAX_PUBLISH_ATTEMPTS) {
          await failTarget(
            b,
            attemptNo,
            startedAt,
            { ...failure, message: `${failure.message} Pokušaji su potrošeni.` },
            runId,
          )
          return { kind: 'failed', message: failure.message }
        }
        const delayMs = retryDelayMs(attemptNo)
        await moveTarget(b.target.id, 'publishing', 'scheduled', {
          last_error_code: failure.code,
          last_error_message: `${failure.message} Novi pokušaj za ${Math.round(delayMs / 60_000)} min.`,
        })
        await recordAttempt(b, attemptNo, startedAt, 'retryable_error', failure, null, runId)
        await rollupPost(b.post.id)
        return { kind: 'retry', delayMs, message: failure.message }
      }
      case 'reauth': {
        await markAccountStatus(b.account.id, 'needs_reauth', failure.code, failure.detail)
        await failTarget(b, attemptNo, startedAt, failure, runId, 'post_needs_reauth')
        return { kind: 'failed', message: failure.message }
      }
      case 'quota': {
        const message = `${failure.message} Termin je pomeren za 24 h.`
        const when = await rescheduleTo(
          b,
          'publishing',
          nextDaySameTime(new Date(job.scheduledAt)),
          failure.code,
          message,
        )
        await recordAttempt(b, attemptNo, startedAt, 'retryable_error', failure, null, runId)
        if (!when) return { kind: 'skipped', reason: 'target promenjen tokom pomeranja' }
        await rollupPost(b.post.id)
        await notifyPost(
          b,
          'post_rescheduled',
          'Objava je pomerena',
          `${b.account.name}: ${message} Novi termin: ${fmt(when, b.brand.timezone)}.`,
          {
            admins: true,
          },
        )
        return {
          kind: 'reschedule',
          at: when.toISOString(),
          socialAccountId: b.account.id,
          version: b.post.version,
          message,
        }
      }
      case 'duplicate': {
        let existing: string | null = null
        try {
          existing = await provider.findExistingPost(normalized, ref, token)
        } catch {
          existing = null
        }
        if (existing) {
          await finalizeSuccess(b, attemptNo, startedAt, existing, null, runId, 'mreža je prijavila duplikat')
          return { kind: 'success', externalId: existing, ...ids }
        }
        await failTarget(b, attemptNo, startedAt, failure, runId)
        return { kind: 'failed', message: failure.message }
      }
      default: {
        await failTarget(b, attemptNo, startedAt, failure, runId)
        return { kind: 'failed', message: failure.message }
      }
    }
  }
}

type PollResult =
  | { kind: 'success'; externalId: string | null }
  | { kind: 'pending'; handle?: PollHandle }
  | { kind: 'failed'; message: string }

async function pollOnce(
  job: PublishJob,
  handle: PollHandle,
  attemptNo: number,
  pollNo: number,
  runId: string | null,
  charge: string | null = null,
): Promise<PollResult> {
  const b = await loadBundle(job.targetId)
  if (!b || b.target.status !== 'publishing') {
    await settleCharge(charge, 'release', 'target_changed')
    return { kind: 'failed', message: 'target više nije u objavljivanju' }
  }
  const provider = providerFor(b.target.platform)
  const startedAt = new Date()
  try {
    const token = await accessTokenFor(b.account)
    const status = await provider.getPublishStatus(handle, token)
    if (status.state === 'pending') {
      if (pollNo >= ASYNC_POLL_MAX) {
        const failure: ClassifiedFailure = {
          kind: 'permanent',
          code: 'ASYNC_TIMEOUT',
          message: 'Mreža nije obradila medij na vreme. Pokušajte ponovo.',
          detail: `obrada ${pollHandleId(handle)} i dalje traje posle ${pollNo} provera`,
          httpStatus: null,
        }
        await settleCharge(charge, 'release', failure.code)
        await failTarget(b, attemptNo, startedAt, failure, runId)
        return { kind: 'failed', message: failure.message }
      }
      return { kind: 'pending', handle: status.next }
    }
    if (status.state === 'failed') {
      await settleCharge(charge, 'release', 'MEDIA_REJECTED')
      const failure: ClassifiedFailure = {
        kind: 'permanent',
        code: 'MEDIA_REJECTED',
        message: status.message,
        detail: status.message,
        httpStatus: null,
      }
      await failTarget(b, attemptNo, startedAt, failure, runId)
      return { kind: 'failed', message: status.message }
    }
    await settleCharge(charge, 'confirm')
    await finalizeSuccess(b, attemptNo, startedAt, status.externalId, status.permalink, runId, null)
    return { kind: 'success', externalId: status.externalId }
  } catch (error) {
    const failure = classifyPublishError(error)
    if (failure.kind === 'retry' && pollNo < ASYNC_POLL_MAX) return { kind: 'pending' }
    await settleCharge(charge, 'release', failure.code)
    await failTarget(b, attemptNo, startedAt, failure, runId)
    return { kind: 'failed', message: failure.message }
  }
}

// ---------------------------------------------------------------------------
// Orkestracija (Inngest funkcija `publish-target` ili test bez Inngest-a)
// ---------------------------------------------------------------------------

export async function runPublishTarget(job: PublishJob, ctx: PublishContext): Promise<PublishReport> {
  const now = ctx.now ?? (() => new Date())
  const report = (
    outcome: PublishOutcome,
    message: string | null,
    externalId: string | null = null,
    attempts = 0,
  ): PublishReport => ({
    outcome,
    targetId: job.targetId,
    externalId,
    message,
    attempts,
  })

  const initial = await ctx.run('load', async () => {
    const b = await loadBundle(job.targetId)
    if (!b) return { ok: false as const, reason: 'target ne postoji' }
    if (!matchesJob(b, job)) return { ok: false as const, reason: `target je ${b.target.status}` }
    return { ok: true as const, reason: null }
  })
  if (!initial.ok) {
    logger.info('publish_run_skipped', { targetId: job.targetId, reason: initial.reason })
    return report('skipped', initial.reason)
  }

  const at = new Date(job.scheduledAt)
  if (at.getTime() > now().getTime()) await ctx.sleepUntil('wait-until-scheduled', at)

  const decision = await ctx.run('recheck', () => recheck(job, ctx.runId, now()))
  switch (decision.action) {
    case 'skip':
      return report('skipped', decision.reason)
    case 'paused':
    case 'needs_reauth':
    case 'assisted':
    case 'failed':
      return report(decision.action === 'assisted' ? 'assisted' : decision.action, decision.message)
    case 'reschedule':
      await ctx.sendEvent('reschedule', {
        kind: 'scheduled',
        targetId: job.targetId,
        scheduledAt: decision.at,
        version: decision.version,
        socialAccountId: decision.socialAccountId,
      })
      return report('rescheduled', decision.message)
    case 'go':
      break
  }

  for (let attemptNo = 1; attemptNo <= MAX_PUBLISH_ATTEMPTS; attemptNo++) {
    const r = await ctx.run(`attempt-${attemptNo}`, () => attemptOnce(job, attemptNo, ctx.runId, now()))
    if (r.kind === 'retry') {
      await ctx.sleep(`retry-wait-${attemptNo}`, r.delayMs)
      continue
    }
    if (r.kind === 'reschedule') {
      await ctx.sendEvent('reschedule', {
        kind: 'scheduled',
        targetId: job.targetId,
        scheduledAt: r.at,
        version: r.version,
        socialAccountId: r.socialAccountId,
      })
      return report('rescheduled', r.message, null, attemptNo)
    }
    if (r.kind === 'skipped') return report('skipped', r.reason, null, attemptNo)
    if (r.kind === 'failed') return report('failed', r.message, null, attemptNo)
    if (r.kind === 'success') {
      await ctx.sendEvent('published', {
        kind: 'published',
        targetId: job.targetId,
        socialAccountId: r.socialAccountId,
        brandId: r.brandId,
      })
      return report('published', null, r.externalId, attemptNo)
    }
    // pending: asinhrona mreža (IG kontejner, TikTok, YouTube obrada, Pinterest i X video)
    let handle = r.handle
    for (let pollNo = 1; pollNo <= ASYNC_POLL_MAX; pollNo++) {
      await ctx.sleep(`poll-wait-${attemptNo}-${pollNo}`, ASYNC_POLL_INTERVAL_MS)
      const current = handle
      const p = await ctx.run(`poll-${attemptNo}-${pollNo}`, () =>
        pollOnce(job, current, attemptNo, pollNo, ctx.runId, r.charge),
      )
      if (p.kind === 'pending') {
        // sledeća faza obrade (npr. IG karusel posle obrade delova) zamenjuje ručku
        if (p.handle) handle = p.handle
        continue
      }
      if (p.kind === 'failed') return report('failed', p.message, null, attemptNo)
      await ctx.sendEvent('published', {
        kind: 'published',
        targetId: job.targetId,
        socialAccountId: r.socialAccountId,
        brandId: r.brandId,
      })
      return report('published', null, p.externalId, attemptNo)
    }
    return report('failed', 'Mreža nije obradila medij na vreme.', null, attemptNo)
  }
  return report('failed', 'Pokušaji su potrošeni.', null, MAX_PUBLISH_ATTEMPTS)
}

/** Inngest `onFailure`: run je pao van naših pokušaja (naša greška) — target ne sme da ostane zaključan. */
export async function handlePublishRunFailure(targetId: string, errorMessage: string): Promise<void> {
  const b = await loadBundle(targetId)
  if (!b) return
  if (b.target.status !== 'publishing' && b.target.status !== 'scheduled') return
  const failure: ClassifiedFailure = {
    kind: 'permanent',
    code: 'INTERNAL',
    message:
      'Objavljivanje je prekinuto zbog greške na našoj strani. Pokušajte ponovo, a ako se ponavlja javite podršci.',
    detail: errorMessage.slice(0, 500),
    httpStatus: null,
  }
  if (b.target.status === 'scheduled') {
    await moveTarget(b.target.id, 'scheduled', 'publishing', { attempt_count: b.target.attempt_count + 1 })
    if (b.post.status === 'scheduled')
      await transitionPostService(b.post.id, 'publishing', ROLLUP_SUMMARY.publishing!)
  }
  await failTarget(b, b.target.attempt_count + 1, new Date(), failure, null)
}

// ---------------------------------------------------------------------------
// Watchdog (cron na 5 min)
// ---------------------------------------------------------------------------

export interface WatchdogContext {
  run: StepRunner
  sendEvent: (name: string, event: OutgoingEvent) => Promise<void>
  now?: () => Date
}

export interface WatchdogReport {
  resent: number
  alarms: number
  unstuck: number
}

interface LateTarget {
  targetId: string
  postId: string
  socialAccountId: string
  brandId: string
  workspaceId: string
  scheduledAt: string
  version: number
  lateMs: number
  wasPublishing: boolean
}

async function scanLate(now: Date): Promise<LateTarget[]> {
  const admin = createSupabaseAdminClient()
  const lateBefore = new Date(now.getTime() - WATCHDOG_LATE_MS).toISOString()
  const cooldown = new Date(now.getTime() - WATCHDOG_RESEND_COOLDOWN_MS).toISOString()
  const stuckBefore = new Date(now.getTime() - STUCK_PUBLISHING_MS).toISOString()
  const { data: late } = await admin
    .from('post_targets')
    .select(
      'id, post_id, social_account_id, brand_id, scheduled_at, status, last_error_code, updated_at, last_attempt_at',
    )
    .in('status', ['scheduled', 'publishing'])
    .lt('scheduled_at', lateBefore)
    .order('scheduled_at', { ascending: true })
    .limit(200)
  const out: LateTarget[] = []
  const postIds = [...new Set((late ?? []).map((t) => t.post_id))]
  const posts = postIds.length
    ? ((await admin.from('posts').select('id, version, workspace_id, status, deleted_at').in('id', postIds))
        .data ?? [])
    : []
  const postById = new Map(posts.map((p) => [p.id, p]))
  for (const t of late ?? []) {
    const post = postById.get(t.post_id)
    if (!post || post.deleted_at) continue
    if (t.status === 'scheduled') {
      if (
        post.status !== 'scheduled' &&
        post.status !== 'publishing' &&
        post.status !== 'partially_published'
      )
        continue
      if (t.last_error_code === 'WATCHDOG_RESENT' && t.updated_at > cooldown) continue
    } else {
      // publishing: zaglavljen samo ako nema skorašnjeg pokušaja
      if ((t.last_attempt_at ?? t.updated_at) > stuckBefore) continue
    }
    out.push({
      targetId: t.id,
      postId: t.post_id,
      socialAccountId: t.social_account_id,
      brandId: t.brand_id,
      workspaceId: post.workspace_id,
      scheduledAt: t.scheduled_at!,
      version: post.version,
      lateMs: now.getTime() - new Date(t.scheduled_at!).getTime(),
      wasPublishing: t.status === 'publishing',
    })
  }
  return out
}

async function markResent(items: LateTarget[], now: Date): Promise<{ alarms: number; unstuck: number }> {
  const admin = createSupabaseAdminClient()
  let alarms = 0
  let unstuck = 0
  for (const it of items) {
    if (it.wasPublishing) {
      const moved = await moveTarget(it.targetId, 'publishing', 'scheduled', {
        last_error_code: 'WATCHDOG_RESENT',
        last_error_message: 'Objavljivanje je zaglavilo; Sova ga je ponovo pokrenula.',
      })
      if (moved) unstuck += 1
      await rollupPost(it.postId)
    } else {
      await admin
        .from('post_targets')
        .update({
          last_error_code: 'WATCHDOG_RESENT',
          last_error_message: `Objava kasni ${Math.round(it.lateMs / 60_000)} min; Sova ju je ponovo poslala u red.`,
        })
        .eq('id', it.targetId)
        .eq('status', 'scheduled')
    }
    if (it.lateMs >= WATCHDOG_ALARM_MS) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'publish_watchdog_alarm')
        .contains('data', { targetId: it.targetId })
      if (!count) {
        const admins = await usersWithRoles(it.workspaceId, it.brandId, ['owner', 'admin'])
        await notifyUsers({
          userIds: admins,
          workspaceId: it.workspaceId,
          brandId: it.brandId,
          type: 'publish_watchdog_alarm',
          title: 'Objava kasni',
          body: `Zakazana objava kasni ${Math.round(it.lateMs / 60_000)} min. Sova ju je ponovo pokrenula; ako se ponovi, javite podršci.`,
          link: `/app/posts/${it.postId}`,
          data: { postId: it.postId, targetId: it.targetId },
        })
        alarms += 1
        logger.error('publish_watchdog_alarm', {
          targetId: it.targetId,
          lateMs: it.lateMs,
          now: now.toISOString(),
        })
      }
    }
  }
  return { alarms, unstuck }
}

export async function runWatchdog(ctx: WatchdogContext): Promise<WatchdogReport> {
  const now = ctx.now ?? (() => new Date())
  const items = await ctx.run('scan', () => scanLate(now()))
  if (!items.length) return { resent: 0, alarms: 0, unstuck: 0 }
  const marks = await ctx.run('mark', () => markResent(items, now()))
  for (const it of items) {
    await ctx.sendEvent(`resend-${it.targetId}`, {
      kind: 'scheduled',
      targetId: it.targetId,
      scheduledAt: it.scheduledAt,
      version: it.version,
      socialAccountId: it.socialAccountId,
    })
  }
  logger.warn('publish_watchdog_resent', { count: items.length, ...marks })
  return { resent: items.length, ...marks }
}

// ---------------------------------------------------------------------------
// Radnje korisnika nad targetom
// ---------------------------------------------------------------------------

async function targetForViewer(
  viewer: Viewer,
  postId: string,
  targetId: string,
): Promise<{ post: PostRow; target: TargetRow }> {
  const post = await loadPost(viewer, postId)
  await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin
    .from('post_targets')
    .select('*')
    .eq('id', targetId)
    .eq('post_id', postId)
    .maybeSingle()
  if (!target) throw new ApiError('NOT_FOUND', 'Target ne postoji.')
  return { post, target }
}

/** Ponovni pokušaj neuspelog targeta (K12) ili targeta koji je čekao ponovno povezivanje. */
export async function retryTarget(viewer: Viewer, postId: string, targetId: string): Promise<PostView> {
  const { post, target } = await targetForViewer(viewer, postId, targetId)
  if (target.status !== 'failed' && target.status !== 'needs_reauth') {
    throw new ApiError('CONFLICT', 'Ponovni pokušaj je moguć samo za neuspele targete.')
  }
  const admin = createSupabaseAdminClient()
  const { data: account } = await admin
    .from('social_accounts')
    .select('id, status, name')
    .eq('id', target.social_account_id)
    .maybeSingle()
  if (!account) throw new ApiError('NOT_FOUND', 'Nalog mreže više ne postoji.')
  if (account.status !== 'active') {
    throw new ApiError(
      'CONFLICT',
      `Nalog ${account.name} nije aktivan. Povežite ga ponovo u Mrežama pa pokušajte.`,
    )
  }
  let when = nextFullMinute(new Date())
  let moved = false
  for (let i = 0; i < 10 && !moved; i++) {
    const { data, error } = await admin
      .from('post_targets')
      .update({
        status: 'scheduled',
        scheduled_at: when.toISOString(),
        last_error_code: null,
        last_error_message: null,
      })
      .eq('id', target.id)
      .in('status', ['failed', 'needs_reauth'])
      .select('id')
    if (error) {
      if (error.code === '23505') {
        when = new Date(when.getTime() + 60_000)
        continue
      }
      throw mapDbError(error)
    }
    moved = (data?.length ?? 0) > 0
    break
  }
  if (!moved) throw new ApiError('CONFLICT', 'Target je u međuvremenu promenjen. Osvežite stranicu.')
  let version = post.version
  if (post.status === 'failed') {
    const { data, error } = await admin.rpc('transition_post', {
      p_post_id: postId,
      p_to: 'scheduled',
      p_expected_version: post.version,
      p_actor: viewer.user.id,
      p_summary: 'ponovni pokušaj objavljivanja',
    })
    if (error) throw mapDbError(error)
    version = data ?? version
  }
  await enqueueTargetScheduled(target.id, when.toISOString(), version, target.social_account_id)
  logger.info('target_retry', { postId, targetId, by: viewer.user.id, at: when.toISOString() })
  return getPostView(viewer, postId)
}

/** Ručno objavljivanje: korisnik je sam postavio sadržaj na mrežu i označava target kao gotov. */
export async function markAssistedDone(
  viewer: Viewer,
  postId: string,
  targetId: string,
  permalink: string | null,
): Promise<PostView> {
  const { target } = await targetForViewer(viewer, postId, targetId)
  if (target.status !== 'assisted_pending') {
    throw new ApiError(
      'CONFLICT',
      'Samo target koji čeka ručno objavljivanje može da se označi kao objavljen.',
    )
  }
  const nowIso = new Date().toISOString()
  const moved = await moveTarget(target.id, 'assisted_pending', 'assisted_done', {
    assisted_done_at: nowIso,
    published_at: nowIso,
    permalink,
    last_error_code: null,
    last_error_message: null,
  })
  if (!moved) throw new ApiError('CONFLICT', 'Target je u međuvremenu promenjen. Osvežite stranicu.')
  await rollupPost(postId)
  logger.info('target_assisted_done', { postId, targetId, by: viewer.user.id })
  return getPostView(viewer, postId)
}

// ---------------------------------------------------------------------------
// Brend sa zakazanim objavama (K3)
// ---------------------------------------------------------------------------

export async function countScheduledPosts(
  viewer: Viewer,
  brandIds: string[],
): Promise<Record<string, number>> {
  if (!brandIds.length) return {}
  const { data } = await viewer.supabase
    .from('posts')
    .select('brand_id')
    .in('brand_id', brandIds)
    .in('status', ['scheduled', 'paused', 'publishing'])
    .is('deleted_at', null)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.brand_id] = (out[row.brand_id] ?? 0) + 1
  return out
}

/** Pre arhiviranja brenda: otkazuje run-ove i zakazane objave da publisher ne objavi ništa posle brisanja. */
export async function cancelScheduledPostsForBrand(
  brandId: string,
  actorId: string,
  summary = 'brend arhiviran',
): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data: posts } = await admin
    .from('posts')
    .select('id, status, version')
    .eq('brand_id', brandId)
    .in('status', ['scheduled', 'paused'])
    .is('deleted_at', null)
  let canceled = 0
  for (const p of posts ?? []) {
    const { data: targets } = await admin
      .from('post_targets')
      .select('id, status')
      .eq('post_id', p.id)
      .in('status', ['scheduled', 'paused', 'needs_reauth', 'pending', 'assisted_pending'])
    for (const t of targets ?? []) {
      await enqueueTargetUnscheduled(t.id)
      await admin.from('post_targets').update({ status: 'canceled' }).eq('id', t.id)
    }
    const { error } = await admin.rpc('transition_post', {
      p_post_id: p.id,
      p_to: 'canceled',
      p_expected_version: p.version,
      p_actor: actorId,
      p_summary: summary,
    })
    if (error) logger.warn('cancel_post_on_brand_delete_failed', { postId: p.id, error: error.message })
    else canceled += 1
  }
  return canceled
}

/** Brisanje radnog prostora: otkazuje zakazane objave svih njegovih brendova. */
export async function cancelScheduledPostsForWorkspace(
  workspaceId: string,
  actorId: string,
): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data: brands } = await admin.from('brands').select('id').eq('workspace_id', workspaceId)
  let canceled = 0
  for (const b of brands ?? [])
    canceled += await cancelScheduledPostsForBrand(b.id, actorId, 'radni prostor obrisan')
  return canceled
}
