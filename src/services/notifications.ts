import 'server-only'

import { createElement } from 'react'

import type { WorkspaceRole } from '@/lib/auth/workspace'

import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { NoticeEmail } from '@/emails/notice'
import type { Json } from '@/types/database'

/**
 * Obaveštenja (brif 9): red u `notifications` za svakog primaoca + email kad je podešen
 * (`notification_preferences` poštuje se u fazi 9b kad stigne UI za podešavanja).
 */
export interface NotifyInput {
  userIds: string[]
  workspaceId: string
  brandId: string | null
  type: string
  title: string
  body: string | null
  data?: Record<string, Json>
  /** relativna putanja u aplikaciji */
  link?: string | null
  email?: boolean
}

export async function notifyUsers(input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.userIds.filter(Boolean))]
  if (!ids.length) return 0
  const admin = createSupabaseAdminClient()
  const rows = ids.map((user_id) => ({
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
  if (input.email) {
    const { data: profiles } = await admin.from('profiles').select('id, email, full_name').in('id', ids)
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
  return ids.length
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
