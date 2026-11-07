import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { statusLabel, type PostStatus } from '@/lib/posts/state-machine'
import type { QueueSlotInput } from '@/lib/schemas/posts'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { zonedToUtc } from '@/lib/zoned-time'
import { getBrand } from '@/services/brands'
import { signedUrl } from '@/services/media-urls'

/**
 * Kalendar (brif 9): objave i targeti u opsegu; UTC u bazi, zona brenda na klijentu (K2).
 * Red objava (`queue_slots`): termini po nalogu i danu; `nextFreeSlot` daje sledeći slobodan.
 */
export interface CalendarItem {
  postId: string
  title: string | null
  excerpt: string
  status: PostStatus
  statusLabel: string
  scheduledFor: string | null
  targets: Array<{
    id: string
    platform: string
    socialAccountId: string
    scheduledAt: string | null
    status: string
    permalink: string | null
  }>
  mediaCount: number
  /** sličica prve slike objave (potpisan URL, 1 h); video i tekst bez sličice */
  thumb: string | null
}

/** Objava u kalendaru sa slikama (redosled i vrsta), da se sličica izabere bez posebnog upita. */
const CALENDAR_POST_SELECT =
  'id, title, master_text, status, scheduled_for, post_media(sort_order, media_assets(kind, bucket, storage_path))'

interface CalendarPostRow {
  id: string
  title: string | null
  master_text: string
  status: PostStatus
  scheduled_for: string | null
  post_media: Array<{
    sort_order: number
    media_assets: { kind: string; bucket: string; storage_path: string } | null
  }>
}

export async function listCalendar(
  viewer: Viewer,
  brandId: string,
  from: string,
  to: string,
  /** početna prikazuje samo broj objava po danu, bez sličica */
  options: { thumbs?: boolean } = {},
): Promise<{ items: CalendarItem[]; timezone: string }> {
  if (new Date(to).getTime() - new Date(from).getTime() > 62 * 86_400_000)
    throw new ApiError('VALIDATION', 'Opseg kalendara može biti najviše 62 dana.')
  // brend, stavke i objave perioda (sa slikama) u jednom krugu (D-164); upiti idu kroz RLS
  const [brand, targetsRes, postsRes] = await Promise.all([
    getBrand(viewer, brandId),
    viewer.supabase
      .from('post_targets')
      .select('id, post_id, platform, social_account_id, scheduled_at, status, permalink')
      .eq('brand_id', brandId)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to),
    viewer.supabase
      .from('posts')
      .select(CALENDAR_POST_SELECT)
      .eq('brand_id', brandId)
      .is('deleted_at', null)
      .gte('scheduled_for', from)
      .lte('scheduled_for', to),
  ])
  if (targetsRes.error) throw mapDbError(targetsRes.error)
  if (postsRes.error) throw mapDbError(postsRes.error)
  const targets = targetsRes.data ?? []
  const posts = (postsRes.data ?? []) as unknown as CalendarPostRow[]
  // stavka u periodu čija objava ima drugi datum: te objave se dočitavaju (obično ih nema)
  const known = new Set(posts.map((p) => p.id))
  const missing = [...new Set(targets.map((t) => t.post_id))].filter((id) => !known.has(id))
  if (missing.length) {
    const { data: extra, error: eErr } = await viewer.supabase
      .from('posts')
      .select(CALENDAR_POST_SELECT)
      .eq('brand_id', brandId)
      .is('deleted_at', null)
      .in('id', missing)
    if (eErr) throw mapDbError(eErr)
    posts.push(...((extra ?? []) as unknown as CalendarPostRow[]))
  }
  const mediaCount = new Map<string, number>()
  const thumbs = new Map<string, string>()
  const first = new Map<string, { bucket: string; storage_path: string }>()
  for (const p of posts) {
    const media = [...(p.post_media ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    if (media.length) mediaCount.set(p.id, media.length)
    // sličica je prva slika po redosledu (video se preskače), kao ranije
    const image = media.find((m) => m.media_assets?.kind === 'image')?.media_assets
    if (image) first.set(p.id, image)
  }
  if (options.thumbs !== false) {
    // svi potpisi iz istog koraka idu u jedan poziv po bucket-u (media-urls)
    await Promise.all(
      [...first].map(async ([postId, asset]) => {
        const url = await signedUrl(asset).catch(() => null)
        if (url) thumbs.set(postId, url)
      }),
    )
  }
  const items: CalendarItem[] = (posts ?? [])
    .map((p) => ({
      postId: p.id,
      title: p.title,
      excerpt: p.master_text.slice(0, 120),
      status: p.status,
      statusLabel: statusLabel(p.status),
      scheduledFor: p.scheduled_for,
      targets: (targets ?? [])
        .filter((t) => t.post_id === p.id)
        .map((t) => ({
          id: t.id,
          platform: t.platform,
          socialAccountId: t.social_account_id,
          scheduledAt: t.scheduled_at,
          status: t.status,
          permalink: t.permalink,
        })),
      mediaCount: mediaCount.get(p.id) ?? 0,
      thumb: thumbs.get(p.id) ?? null,
    }))
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
  return { items, timezone: brand.timezone }
}

export interface QueueSlotView {
  id: string
  socialAccountId: string
  weekday: number
  timeLocal: string
  source: string
  isActive: boolean
}

export async function listQueueSlots(viewer: Viewer, brandId: string): Promise<QueueSlotView[]> {
  await getBrand(viewer, brandId)
  const rows = unwrap(
    await viewer.supabase
      .from('queue_slots')
      .select('*')
      .eq('brand_id', brandId)
      .order('weekday')
      .order('time_local'),
  )
  return rows.map((r) => ({
    id: r.id,
    socialAccountId: r.social_account_id,
    weekday: r.weekday,
    timeLocal: r.time_local.slice(0, 5),
    source: r.source,
    isActive: r.is_active,
  }))
}

export async function createQueueSlot(viewer: Viewer, input: QueueSlotInput): Promise<QueueSlotView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { data: acc } = await viewer.supabase
    .from('social_accounts_public')
    .select('id')
    .eq('id', input.socialAccountId)
    .eq('brand_id', brand.id)
    .maybeSingle()
  if (!acc) throw new ApiError('VALIDATION', 'Nalog ne pripada ovom brendu.')
  const row = unwrap(
    await viewer.supabase
      .from('queue_slots')
      .insert({
        brand_id: brand.id,
        social_account_id: input.socialAccountId,
        weekday: input.weekday,
        time_local: `${input.timeLocal}:00`,
        source: 'manual',
      })
      .select('*')
      .single(),
    'Termin nije sačuvan.',
  )
  return {
    id: row.id,
    socialAccountId: row.social_account_id,
    weekday: row.weekday,
    timeLocal: row.time_local.slice(0, 5),
    source: row.source,
    isActive: row.is_active,
  }
}

export async function deleteQueueSlot(viewer: Viewer, slotId: string): Promise<void> {
  const row = unwrap(
    await viewer.supabase.from('queue_slots').select('id, brand_id').eq('id', slotId).maybeSingle(),
    'Termin ne postoji.',
  )
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { error } = await viewer.supabase.from('queue_slots').delete().eq('id', slotId)
  if (error) throw mapDbError(error)
}

/** Sledeći slobodan termin iz reda za nalog, posle zadatog trenutka (do 8 nedelja unapred). */
export async function nextFreeSlot(
  viewer: Viewer,
  brandId: string,
  socialAccountId: string,
  after = new Date(),
): Promise<string | null> {
  const brand = await getBrand(viewer, brandId)
  return nextFreeSlotFor(viewer, brand, [socialAccountId], { after })
}

/**
 * Najraniji slobodan termin reda za bilo koji od naloga (D-164): jedan upit za termine i jedan za
 * zauzeta mesta, umesto po nalogu (pregled za odobrenje je to radio za svaku mrežu, jedno za drugim).
 * Za svaki nalog važi isto pravilo kao ranije; termini mogu stići već pročitani.
 */
export async function nextFreeSlotFor(
  viewer: Viewer,
  brand: { id: string; timezone: string },
  accountIds: string[],
  options: { after?: Date; slots?: QueueSlotView[] } = {},
): Promise<string | null> {
  const after = options.after ?? new Date()
  const wanted = new Set(accountIds)
  if (!wanted.size) return null
  const slots = (options.slots ?? (await listQueueSlots(viewer, brand.id))).filter(
    (s) => s.isActive && wanted.has(s.socialAccountId),
  )
  if (!slots.length) return null
  const accounts = [...new Set(slots.map((s) => s.socialAccountId))]
  const { data: taken } = await viewer.supabase
    .from('post_targets')
    .select('social_account_id, scheduled_at')
    .in('social_account_id', accounts)
    .in('status', ['scheduled', 'paused', 'publishing'])
  let best: string | null = null
  for (const accountId of accounts) {
    const takenSet = new Set(
      (taken ?? [])
        .filter((t) => t.social_account_id === accountId)
        .map((t) => (t.scheduled_at ? new Date(t.scheduled_at).toISOString().slice(0, 16) : '')),
    )
    const slot = firstFreeSlot(
      slots.filter((s) => s.socialAccountId === accountId),
      takenSet,
      brand.timezone,
      after,
    )
    if (slot && (!best || slot < best)) best = slot
  }
  return best
}

function firstFreeSlot(
  slots: QueueSlotView[],
  takenSet: Set<string>,
  timeZone: string,
  after: Date,
): string | null {
  for (let d = 0; d < 56; d++) {
    const day = new Date(after.getTime() + d * 86_400_000)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(day)
    const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
    for (const s of slots
      .filter((x) => x.weekday === weekday)
      .sort((a, b) => a.timeLocal.localeCompare(b.timeLocal))) {
      const iso = zonedToUtc(dateStr, s.timeLocal, timeZone)
      if (new Date(iso).getTime() <= after.getTime() + 60_000) continue
      if (!takenSet.has(iso.slice(0, 16))) return iso
    }
  }
  return null
}
