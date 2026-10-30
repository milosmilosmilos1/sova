import 'server-only'

import { createElement } from 'react'

import {
  NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
  type NotificationTypeDef,
} from '@/config/notifications'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership, type WorkspaceRole } from '@/lib/auth/workspace'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { NoticeEmail } from '@/emails/notice'
import { sendPushToUsers } from '@/services/push'
import type { Json } from '@/types/database'

/**
 * Obaveštenja (brif 9): red u `notifications` za svakog primaoca + email kad je dozvoljen.
 * `notification_preferences` (po korisniku, workspace-u, tipu i kanalu) isključuje kanal;
 * bez reda važi podrazumevana vrednost iz `src/config/notifications.ts`.
 */
export interface NotifyInput {
  userIds: string[]
  workspaceId: string
  brandId: string | null
  type: NotificationType
  title: string
  body: string | null
  data?: Record<string, Json>
  /** relativna putanja u aplikaciji */
  link?: string | null
  /** nadjačava podrazumevano slanje emaila za tip (korisnikova podešavanja i dalje važe) */
  email?: boolean
  /** nadjačava slanje na telefon (D-118) */
  push?: boolean
}

interface PrefRow {
  user_id: string
  type: string
  channel: NotificationChannel
  enabled: boolean
}

async function loadDisabled(
  userIds: string[],
  workspaceId: string,
  type: NotificationType,
): Promise<Map<string, Set<NotificationChannel>>> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('user_id, type, channel, enabled')
    .eq('workspace_id', workspaceId)
    .eq('type', type)
    .eq('enabled', false)
    .in('user_id', userIds)
  const out = new Map<string, Set<NotificationChannel>>()
  for (const row of (data ?? []) as PrefRow[]) {
    const set = out.get(row.user_id) ?? new Set<NotificationChannel>()
    set.add(row.channel)
    out.set(row.user_id, set)
  }
  return out
}

export async function notifyUsers(input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.userIds.filter(Boolean))]
  if (!ids.length) return 0
  const admin = createSupabaseAdminClient()
  const disabled = await loadDisabled(ids, input.workspaceId, input.type)
  const inApp = ids.filter((id) => !disabled.get(id)?.has('in_app'))
  if (inApp.length) {
    const rows = inApp.map((user_id) => ({
      user_id,
      workspace_id: input.workspaceId,
      brand_id: input.brandId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: { ...(input.data ?? {}), link: input.link ?? null } as NonNullable<Json>,
    }))
    const { error } = await admin.from('notifications').insert(rows)
    if (error) logger.warn('notifications_insert_failed', { type: input.type, error })
  }
  const wantEmail = input.email ?? NOTIFICATION_TYPES[input.type].emailDefault
  if (wantEmail) {
    const emailIds = ids.filter((id) => !disabled.get(id)?.has('email'))
    if (emailIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', emailIds)
      for (const p of profiles ?? []) {
        if (!p.email) continue
        try {
          await sendEmail({
            to: p.email,
            subject: input.title,
            react: createElement(NoticeEmail, {
              title: input.title,
              body: input.body ?? '',
              ctaUrl: input.link ? `${env.NEXT_PUBLIC_APP_URL}${input.link}` : null,
              ctaLabel: input.link ? 'Otvori u Sovi' : null,
              recipientName: p.full_name,
            }),
            tags: { type: input.type },
          })
        } catch (error) {
          logger.warn('notification_email_failed', { userId: p.id, error })
        }
      }
    }
  }
  const def = NOTIFICATION_TYPES[input.type] as NotificationTypeDef
  if (input.push ?? def.pushDefault ?? false) {
    const pushIds = ids.filter((id) => !disabled.get(id)?.has('push'))
    await sendPushToUsers(pushIds, {
      title: input.title,
      body: input.body ?? '',
      url: input.link ?? '/app',
      tag: input.type,
    }).catch((error) => logger.warn('notification_push_failed', { type: input.type, error }))
  }
  return inApp.length
}

/** Članovi workspace-a sa datim ulogama koji imaju pristup brendu. */
export async function usersWithRoles(
  workspaceId: string,
  brandId: string,
  roles: WorkspaceRole[],
): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  const { data: members } = await admin
    .from('workspace_members')
    .select('user_id, role, all_brands')
    .eq('workspace_id', workspaceId)
    .in('role', roles)
  const out: string[] = []
  const restricted: string[] = []
  for (const m of members ?? []) {
    if (m.all_brands) out.push(m.user_id)
    else restricted.push(m.user_id)
  }
  if (restricted.length) {
    const { data: access } = await admin
      .from('member_brand_access')
      .select('user_id')
      .eq('brand_id', brandId)
      .in('user_id', restricted)
    for (const a of access ?? []) out.push(a.user_id)
  }
  return [...new Set(out)]
}

// ---------------------------------------------------------------------------
// Čitanje i podešavanja (korisnikov klijent, RLS: sopstveni redovi)
// ---------------------------------------------------------------------------

export interface NotificationView {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, Json>
  workspaceId: string | null
  brandId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  items: NotificationView[]
  unreadCount: number
}

export async function listNotifications(
  viewer: Viewer,
  opts: { workspaceId?: string | null; unreadOnly?: boolean; limit?: number },
): Promise<NotificationList> {
  let q = viewer.supabase
    .from('notifications')
    .select('id, type, title, body, data, workspace_id, brand_id, read_at, created_at')
    .eq('user_id', viewer.user.id)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100))
  if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId)
  if (opts.unreadOnly) q = q.is('read_at', null)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  let c = viewer.supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', viewer.user.id)
    .is('read_at', null)
  if (opts.workspaceId) c = c.eq('workspace_id', opts.workspaceId)
  const { count } = await c
  return {
    unreadCount: count ?? 0,
    items: (data ?? []).map((n) => {
      const d = (n.data as Record<string, Json> | null) ?? {}
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: typeof d.link === 'string' ? d.link : null,
        data: d,
        workspaceId: n.workspace_id,
        brandId: n.brand_id,
        readAt: n.read_at,
        createdAt: n.created_at,
      }
    }),
  }
}

export async function markNotificationsRead(
  viewer: Viewer,
  input: { ids?: string[]; all?: boolean; workspaceId?: string | null },
): Promise<number> {
  if (!input.all && !input.ids?.length) return 0
  let q = viewer.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', viewer.user.id)
    .is('read_at', null)
  if (input.ids?.length) q = q.in('id', input.ids)
  if (input.all && input.workspaceId) q = q.eq('workspace_id', input.workspaceId)
  const { data, error } = await q.select('id')
  if (error) throw mapDbError(error)
  return data?.length ?? 0
}

export interface PreferenceView {
  type: NotificationType
  label: string
  description: string
  inApp: boolean
  email: boolean
}

export async function getNotificationPreferences(
  viewer: Viewer,
  workspaceId: string,
): Promise<PreferenceView[]> {
  await requireMembership(viewer, workspaceId)
  const { data, error } = await viewer.supabase
    .from('notification_preferences')
    .select('type, channel, enabled')
    .eq('user_id', viewer.user.id)
    .eq('workspace_id', workspaceId)
  if (error) throw mapDbError(error)
  const rows = (data ?? []) as Array<Pick<PrefRow, 'type' | 'channel' | 'enabled'>>
  const find = (type: string, channel: NotificationChannel): boolean | null =>
    rows.find((r) => r.type === type && r.channel === channel)?.enabled ?? null
  return NOTIFICATION_TYPE_KEYS.map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    description: NOTIFICATION_TYPES[type].description,
    inApp: find(type, 'in_app') ?? true,
    email: find(type, 'email') ?? NOTIFICATION_TYPES[type].emailDefault,
  }))
}

export async function setNotificationPreferences(
  viewer: Viewer,
  workspaceId: string,
  items: Array<{ type: NotificationType; inApp: boolean; email: boolean }>,
): Promise<PreferenceView[]> {
  await requireMembership(viewer, workspaceId)
  if (!items.length) throw new ApiError('VALIDATION', 'Nema podešavanja za čuvanje.')
  const rows = items.flatMap((i) => [
    {
      user_id: viewer.user.id,
      workspace_id: workspaceId,
      type: i.type,
      channel: 'in_app' as const,
      enabled: i.inApp,
    },
    {
      user_id: viewer.user.id,
      workspace_id: workspaceId,
      type: i.type,
      channel: 'email' as const,
      enabled: i.email,
    },
  ])
  const { error } = await viewer.supabase
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,workspace_id,type,channel' })
  if (error) throw mapDbError(error)
  return getNotificationPreferences(viewer, workspaceId)
}
