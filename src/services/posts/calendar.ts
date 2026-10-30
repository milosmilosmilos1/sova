import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { statusLabel, type PostStatus } from '@/lib/posts/state-machine'
import type { QueueSlotInput } from '@/lib/schemas/posts'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { zonedToUtc } from '@/lib/zoned-time'
import { getBrand } from '@/services/brands'

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

export async function listCalendar(
  viewer: Viewer,
  brandId: string,
  from: string,
  to: string,
): Promise<{ items: CalendarItem[]; timezone: string }> {
  const brand = await getBrand(viewer, brandId)
  if (new Date(to).getTime() - new Date(from).getTime() > 62 * 86_400_000)
    throw new ApiError('VALIDATION', 'Opseg kalendara može biti najviše 62 dana.')
  const { data: targets, error } = await viewer.supabase
    .from('post_targets')
    .select('id, post_id, platform, social_account_id, scheduled_at, status, permalink')
    .eq('brand_id', brandId)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
  if (error) throw mapDbError(error)
  const { data: posts, error: pErr } = await viewer.supabase
    .from('posts')
    .select('id, title, master_text, status, scheduled_for')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .or(
      `and(scheduled_for.gte.${from},scheduled_for.lte.${to})${targets?.length ? `,id.in.(${[...new Set(targets.map((t) => t.post_id))].join(',')})` : ''}`,
    )
  if (pErr) throw mapDbError(pErr)
  const ids = (posts ?? []).map((p) => p.id)
  const mediaCount = new Map<string, number>()
  const thumbs = new Map<string, string>()
  if (ids.length) {
    const { data: media } = await viewer.supabase
      .from('post_media')
      .select('post_id, sort_order, media_assets(kind, bucket, storage_path)')
      .in('post_id', ids)
      .order('sort_order')
    const first = new Map<string, { bucket: string; path: string }>()
    for (const m of media ?? []) {
      mediaCount.set(m.post_id, (mediaCount.get(m.post_id) ?? 0) + 1)
      const asset = m.media_assets as { kind: string; bucket: string; storage_path: string } | null
      if (!first.has(m.post_id) && asset?.kind === 'image')
        first.set(m.post_id, { bucket: asset.bucket, path: asset.storage_path })
    }
    // potpisani linkovi u jednom pozivu po bucket-u (kalendar ima i desetine objava)
    const byBucket = new Map<string, string[]>()
    for (const f of first.values()) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path])
    const urls = new Map<string, string>()
    const admin = createSupabaseAdminClient()
    for (const [bucket, paths] of byBucket) {
      const { data } = await admin.storage.from(bucket).createSignedUrls(paths, 3600)
      for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(`${bucket}/${d.path}`, d.signedUrl)
    }
    for (const [postId, f] of first) {
      const url = urls.get(`${f.bucket}/${f.path}`)
      if (url) thumbs.set(postId, url)
    }
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
  const slots = (await listQueueSlots(viewer, brandId)).filter(
    (s) => s.socialAccountId === socialAccountId && s.isActive,
  )
  if (!slots.length) return null
  const { data: taken } = await viewer.supabase
    .from('post_targets')
    .select('scheduled_at')
    .eq('social_account_id', socialAccountId)
    .in('status', ['scheduled', 'paused', 'publishing'])
  const takenSet = new Set(
    (taken ?? []).map((t) => (t.scheduled_at ? new Date(t.scheduled_at).toISOString().slice(0, 16) : '')),
  )
  for (let d = 0; d < 56; d++) {
    const day = new Date(after.getTime() + d * 86_400_000)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: brand.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(day)
    const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
    for (const s of slots
      .filter((x) => x.weekday === weekday)
      .sort((a, b) => a.timeLocal.localeCompare(b.timeLocal))) {
      const iso = zonedToUtc(dateStr, s.timeLocal, brand.timezone)
      if (new Date(iso).getTime() <= after.getTime() + 60_000) continue
      if (!takenSet.has(iso.slice(0, 16))) return iso
    }
  }
  return null
}
