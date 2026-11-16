import 'server-only'

import { enqueueMediaCleanup } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { logAdminAction, type AdminContext } from '@/services/admin/audit'
import type { StepRunner } from '@/services/autopilot/runner'
import type { Json } from '@/types/database'

/**
 * Čišćenje skladišta (D-168). Sova briše fajlove koje je sama napravila ili preuzela kad više ne
 * trebaju nijednoj objavi: kopije sa Unsplash-a i Pexels-a, video snimke, slojeve teksta videa,
 * slajdove i gotov video iz pregledača. Galeriju (otpremljeno i Canva), logo i Figma šablone nikad
 * ne dira, a ni objavljene slajdove i gotov video objave koja postoji. Red u bazi ostaje (obrisan, sa
 * `source_data.purgedAt`), pa Sova i dalje zna koje je fotografije brend dobio (D-121) i čija je
 * atribucija.
 *
 * Pravila (vlasnik, 16.11.2026):
 * - pomoćni fajlovi objavljene objave (kopije sa stoka, snimci, slojevi videa): 30 dana posle objave;
 * - fajlovi obrisane objave: 30 dana posle brisanja;
 * - stare verzije i izbor koji nije postao objava: kad su stariji od 7 dana i ničemu ne trebaju;
 * - jednokratno čišćenje iz admin panela: sve što nijedna objava ne koristi, starije od jednog dana
 *   (fajlovi obrisanih objava odmah, pomoćni fajlovi objave tek 30 dana posle objave).
 */
export interface CleanupPlan {
  /** objava obrisana pre manje dana i dalje čuva svoje fajlove; 0: obrisana objava ne čuva ništa */
  trashDays: number
  /** objavljena objava čuva pomoćne fajlove ovoliko dana posle objave */
  publishedDays: number
  /** fajl mlađi od ovoga se ne dira (Sova ga možda baš sad crta ili čuva) */
  minAgeHours: number
}

export const DAILY_PLAN: CleanupPlan = { trashDays: 30, publishedDays: 30, minAgeHours: 7 * 24 }
export const CATCH_UP_PLAN: CleanupPlan = { trashDays: 0, publishedDays: 30, minAgeHours: 24 }

/** Izvori koje pravi ili preuzima Sova; `upload` i `canva` su korisnikovi. */
const SOVA_SOURCES = ['template', 'unsplash', 'pexels', 'gemini'] as const
/** Gotov video u temi iz pregledača (D-128) ide kao otpremljen fajl ovog imena. */
const THEME_VIDEO_NAME = 'video-u-temi.mp4'
const PUBLISHED = ['published', 'partially_published']
const PAGE = 1000
const IN_BATCH = 200
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export interface CleanupCandidate {
  id: string
  bucket: string
  storagePath: string
  sizeBytes: number
  /** vrsta fajla za izveštaj: slajd, stok, snimak, video... */
  kind: string
}

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3600_000).toISOString()
const daysAgo = (now: Date, d: number) => hoursAgo(now, d * 24)

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Svaki UUID u JSON-u (dizajn objave, dizajn i podešavanja brenda): bolje sačuvati višak nego obrisati potreban. */
function uuidsIn(value: unknown, into: Set<string>): void {
  if (value === null || value === undefined) return
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const m of text.matchAll(UUID)) into.add(m[0].toLowerCase())
}

/** Sve stranice upita, po `PAGE` redova. */
async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw mapDbError(error as Parameters<typeof mapDbError>[0])
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/**
 * Fajlovi koji i dalje trebaju: logo, dizajn i podešavanja brendova (Figma šabloni, fotografije u
 * Sadržaju brenda), sve iz dizajna objave koja se još može crtati ili je objavljena skoro, slika videa
 * svake postojeće objave. Objavljeni slajdovi i gotov video (`post_media`) se proveravaju posebno.
 */
async function protectedIds(plan: CleanupPlan, now: Date): Promise<Set<string>> {
  const admin = createSupabaseAdminClient()
  const keep = new Set<string>()
  const trashAfter = daysAgo(now, plan.trashDays)
  const publishedAfter = daysAgo(now, plan.publishedDays)

  const brands = await allPages<{ logo_asset_id: string | null; design: Json; settings: Json }>((from, to) =>
    admin.from('brands').select('logo_asset_id, design, settings').order('id').range(from, to),
  )
  for (const b of brands) {
    if (b.logo_asset_id) keep.add(b.logo_asset_id.toLowerCase())
    uuidsIn(b.design, keep)
    uuidsIn(b.settings, keep)
  }

  // objava koja postoji ili je skoro obrisana; dizajn (težak) se čita samo za one koje ga čuvaju
  const posts = await allPages<{
    id: string
    status: string
    deleted_at: string | null
    updated_at: string
    poster: string | null
  }>((from, to) => {
    const q = admin
      .from('posts')
      .select('id, status, deleted_at, updated_at, poster:design->video->>posterAssetId')
      .order('id')
      .range(from, to)
    return plan.trashDays > 0
      ? q.or(`deleted_at.is.null,deleted_at.gt.${trashAfter}`)
      : q.is('deleted_at', null)
  })
  // kada je objava objavljena: po mrežama (objava preko pomoći beleži kad je korisnik potvrdio)
  const targets = await allPages<{
    post_id: string
    published_at: string | null
    assisted_done_at: string | null
  }>((from, to) =>
    admin
      .from('post_targets')
      .select('post_id, published_at, assisted_done_at')
      .or('published_at.not.is.null,assisted_done_at.not.is.null')
      .order('id')
      .range(from, to),
  )
  const lastPublished = new Map<string, string>()
  for (const t of targets) {
    const at = [t.published_at, t.assisted_done_at]
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1)
    if (at && at > (lastPublished.get(t.post_id) ?? '')) lastPublished.set(t.post_id, at)
  }

  const keepDesign: string[] = []
  for (const p of posts) {
    if (p.deleted_at === null && p.poster) keep.add(p.poster.toLowerCase())
    if (p.deleted_at !== null) {
      keepDesign.push(p.id) // u korpi kraće od `trashDays` (upit je već odbacio starije)
      continue
    }
    if (!PUBLISHED.includes(p.status)) {
      keepDesign.push(p.id) // nacrt, odobravanje, zakazano, neuspelo: može se crtati ili objaviti ponovo
      continue
    }
    const at = lastPublished.get(p.id) ?? p.updated_at
    if (at > publishedAfter) keepDesign.push(p.id)
  }
  for (const ids of chunks(keepDesign, IN_BATCH)) {
    const { data, error } = await admin.from('posts').select('design').in('id', ids)
    if (error) throw mapDbError(error)
    for (const p of data ?? []) uuidsIn(p.design, keep)
  }
  return keep
}

/** Fajlovi koje koristi objava koja postoji (ili je u korpi kraće od `trashDays`). */
async function usedByPosts(ids: string[], plan: CleanupPlan, now: Date): Promise<Set<string>> {
  const admin = createSupabaseAdminClient()
  const used = new Set<string>()
  const trashAfter = daysAgo(now, plan.trashDays)
  for (const batch of chunks(ids, IN_BATCH)) {
    const { data, error } = await admin
      .from('post_media')
      .select('media_asset_id, posts!inner(deleted_at)')
      .in('media_asset_id', batch)
    if (error) throw mapDbError(error)
    for (const row of data ?? []) {
      const post = row.posts as unknown as { deleted_at: string | null }
      if (post.deleted_at === null || (plan.trashDays > 0 && post.deleted_at > trashAfter))
        used.add(row.media_asset_id.toLowerCase())
    }
  }
  return used
}

function kindOf(row: { source: string; kind: string }): string {
  if (row.source === 'upload') return 'video'
  if (row.source === 'pexels') return row.kind === 'video' ? 'snimak' : 'stok'
  if (row.source === 'unsplash') return 'stok'
  if (row.source === 'gemini') return 'ai'
  return 'slajd'
}

/**
 * Fajlovi za brisanje, najstariji prvo, najviše `limit`. Uzima i redove koje je Sova ranije
 * označila kao obrisane a fajl ostao (npr. slajdovi prekinutog usklađivanja).
 */
export async function findCleanupCandidates(
  plan: CleanupPlan,
  now: Date,
  limit: number,
): Promise<CleanupCandidate[]> {
  const admin = createSupabaseAdminClient()
  const before = hoursAgo(now, plan.minAgeHours)
  type Row = {
    id: string
    bucket: string
    storage_path: string
    size_bytes: number
    source: string
    kind: string
  }
  const columns = 'id, bucket, storage_path, size_bytes, source, kind'
  const [sova, videos] = await Promise.all([
    allPages<Row>((from, to) =>
      admin
        .from('media_assets')
        .select(columns)
        .in('source', [...SOVA_SOURCES])
        .lt('created_at', before)
        .is('source_data->>purgedAt', null)
        .order('created_at')
        .range(from, to),
    ),
    allPages<Row>((from, to) =>
      admin
        .from('media_assets')
        .select(columns)
        .eq('source', 'upload')
        .eq('kind', 'video')
        .or(`source_data->>original_name.eq."${THEME_VIDEO_NAME}",source_data->>themeVideo.eq.true`)
        .lt('created_at', before)
        .is('source_data->>purgedAt', null)
        .order('created_at')
        .range(from, to),
    ),
  ])
  const rows = [...sova, ...videos]
  if (!rows.length) return []
  const keep = await protectedIds(plan, now)
  const open = rows.filter((r) => !keep.has(r.id.toLowerCase()))
  const used = await usedByPosts(
    open.map((r) => r.id),
    plan,
    now,
  )
  return open
    .filter((r) => !used.has(r.id.toLowerCase()))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      bucket: r.bucket,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
      kind: kindOf(r),
    }))
}

export interface PurgeResult {
  files: number
  bytes: number
  byKind: Record<string, { files: number; bytes: number }>
  failed: number
}

/**
 * Briše fajlove iz skladišta, pa red označava kao obrisan (`deleted_at`, `source_data.purgedAt`).
 * Grupa fajlova koju skladište odbije ostaje za sledeći put.
 */
export async function purgeMedia(candidates: CleanupCandidate[], now = new Date()): Promise<PurgeResult> {
  const admin = createSupabaseAdminClient()
  const result: PurgeResult = { files: 0, bytes: 0, byKind: {}, failed: 0 }
  const byBucket = new Map<string, CleanupCandidate[]>()
  for (const c of candidates) byBucket.set(c.bucket, [...(byBucket.get(c.bucket) ?? []), c])
  const removed: CleanupCandidate[] = []
  for (const [bucket, list] of byBucket) {
    for (const part of chunks(list, 100)) {
      const { error } = await admin.storage.from(bucket).remove(part.map((c) => c.storagePath))
      if (error) {
        logger.warn('media_cleanup_remove_failed', { bucket, count: part.length, error })
        result.failed += part.length
        continue
      }
      removed.push(...part)
    }
  }
  const at = now.toISOString()
  await mapLimit(removed, 10, async (c) => {
    const { data } = await admin
      .from('media_assets')
      .select('source_data, deleted_at')
      .eq('id', c.id)
      .maybeSingle()
    const base =
      data?.source_data && typeof data.source_data === 'object' && !Array.isArray(data.source_data)
        ? data.source_data
        : {}
    const { error } = await admin
      .from('media_assets')
      .update({ deleted_at: data?.deleted_at ?? at, source_data: { ...base, purgedAt: at } })
      .eq('id', c.id)
    if (error) logger.warn('media_cleanup_mark_failed', { assetId: c.id, error })
  })
  for (const c of removed) {
    result.files++
    result.bytes += c.sizeBytes
    const k = (result.byKind[c.kind] ??= { files: 0, bytes: 0 })
    k.files++
    k.bytes += c.sizeBytes
  }
  return result
}

export interface CleanupRun {
  at: string
  mode: 'daily' | 'catch-up'
  files: number
  bytes: number
  byKind: Record<string, { files: number; bytes: number }>
  failed: number
  requestedBy: string | null
}

const SETTING_KEY = 'media_cleanup'
const HISTORY = 10

/** Poslednja čišćenja (najnovije prvo) za admin panel. */
export async function cleanupHistory(): Promise<CleanupRun[]> {
  const { data } = await createSupabaseAdminClient()
    .from('platform_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()
  const runs = (data?.value as { runs?: unknown } | null)?.runs
  return Array.isArray(runs) ? (runs as CleanupRun[]) : []
}

/** Najviše fajlova u jednom pokretanju (ostatak ide sledeći put) i fajlova po koraku brisanja. */
const RUN_LIMIT = 2000
const PURGE_BATCH = 300

/**
 * Jedno čišćenje u koracima pozadinskog posla (D-122): spisak u jednom koraku, brisanje po 300
 * fajlova, pa zapis za admin panel. Ponovljen korak ne bira fajlove ponovo.
 */
export async function runMediaCleanup(
  step: StepRunner,
  mode: CleanupRun['mode'],
  requestedBy: string | null,
): Promise<CleanupRun> {
  const plan = mode === 'catch-up' ? CATCH_UP_PLAN : DAILY_PLAN
  const at = await step('now', async () => new Date().toISOString())
  const now = new Date(at)
  const candidates = await step('find', () => findCleanupCandidates(plan, now, RUN_LIMIT))
  const total: PurgeResult = { files: 0, bytes: 0, byKind: {}, failed: 0 }
  for (let i = 0; i < candidates.length; i += PURGE_BATCH) {
    const part = await step(`purge-${i}`, () => purgeMedia(candidates.slice(i, i + PURGE_BATCH), now))
    total.files += part.files
    total.bytes += part.bytes
    total.failed += part.failed
    for (const [k, v] of Object.entries(part.byKind)) {
      const t = (total.byKind[k] ??= { files: 0, bytes: 0 })
      t.files += v.files
      t.bytes += v.bytes
    }
  }
  const run: CleanupRun = { at, mode, ...total, requestedBy }
  await step('record', () => recordCleanupRun(run))
  logger.info('media_cleanup', {
    mode,
    files: run.files,
    mb: Math.round(run.bytes / 1048576),
    failed: run.failed,
  })
  return run
}

/** „Očisti otpad sada” u admin panelu: jednokratno čišćenje u pozadini, uz zapis u audit log. */
export async function requestMediaCleanup(ctx: AdminContext): Promise<{ queued: true }> {
  await enqueueMediaCleanup(ctx.adminId)
  await logAdminAction(ctx, {
    action: 'media.cleanup',
    targetType: 'platform_setting',
    targetId: SETTING_KEY,
  })
  return { queued: true }
}

export async function recordCleanupRun(run: CleanupRun): Promise<void> {
  const runs = [run, ...(await cleanupHistory())].slice(0, HISTORY)
  const { error } = await createSupabaseAdminClient()
    .from('platform_settings')
    .upsert(
      {
        key: SETTING_KEY,
        value: { runs } as unknown as NonNullable<Json>,
        description: 'Čišćenje skladišta (D-168): poslednja pokretanja',
        is_public: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  if (error) throw mapDbError(error)
}
