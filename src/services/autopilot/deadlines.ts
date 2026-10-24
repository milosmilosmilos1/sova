import 'server-only'

import { deadlineAction, type AutopilotLevel } from '@/lib/autopilot/rules'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import { systemApprove, systemCancel, systemSchedule, systemWithdraw } from '@/services/posts/system'

/**
 * Rokovi Autopilot objava (brif 9.2, cron na 15 min): odobrena objava sa terminom se zakazuje;
 * neodobrena posle roka se preskače ili objavljuje (nivo ≥ 2, podešavanje brenda), a na nivou 1
 * stiže podsetnik i objava se vraća u nacrt kad termin prođe.
 */
export interface DeadlineSummary {
  scheduled: number
  published: number
  skipped: number
  reminded: number
  expired: number
  errors: number
}

async function notify(
  brandId: string,
  workspaceId: string,
  postId: string,
  type: string,
  title: string,
  body: string,
  kind: string,
) {
  const ids = await usersWithRoles(workspaceId, brandId, ['owner', 'admin', 'approver'])
  await notifyUsers({
    userIds: ids,
    workspaceId,
    brandId,
    type: type as 'autopilot_deadline',
    title,
    body,
    link: `/app/posts/${postId}`,
    data: { postId, kind },
  })
}

export async function runAutopilotDeadlines(now = new Date()): Promise<DeadlineSummary> {
  const admin = createSupabaseAdminClient()
  const summary: DeadlineSummary = {
    scheduled: 0,
    published: 0,
    skipped: 0,
    reminded: 0,
    expired: 0,
    errors: 0,
  }
  const { data: posts } = await admin
    .from('posts')
    .select('id, brand_id, workspace_id, status, scheduled_for, title')
    .eq('source', 'autopilot')
    .in('status', ['in_review', 'approved'])
    .is('deleted_at', null)
    .not('scheduled_for', 'is', null)
    .order('scheduled_for', { ascending: true })
    .limit(500)
  if (!posts?.length) return summary
  const brandIds = [...new Set(posts.map((p) => p.brand_id))]
  const { data: brands } = await admin
    .from('brands')
    .select('id, status, autopilot_level, autopilot_approval_deadline_hours, autopilot_unapproved_action')
    .in('id', brandIds)
  const brandById = new Map((brands ?? []).map((b) => [b.id, b]))

  for (const p of posts) {
    const b = brandById.get(p.brand_id)
    if (!b || b.status !== 'active') continue
    const title = p.title ?? 'Objava'
    try {
      if (p.status === 'approved') {
        if (new Date(p.scheduled_for!).getTime() > now.getTime() + 60_000) {
          await systemSchedule(p.id, 'Autopilot: odobreno, zakazano za planirani termin')
          summary.scheduled += 1
        } else {
          await systemWithdraw(p.id, 'Autopilot: termin je prošao pre zakazivanja')
          await notify(
            p.brand_id,
            p.workspace_id,
            p.id,
            'autopilot_skipped',
            'Termin Autopilot objave je prošao',
            `${title}: zakažite je za novi termin.`,
            'expired',
          )
          summary.expired += 1
        }
        continue
      }
      const action = deadlineAction({
        level: b.autopilot_level as AutopilotLevel,
        unapprovedAction: b.autopilot_unapproved_action as 'skip' | 'publish',
        scheduledFor: p.scheduled_for!,
        deadlineHours: b.autopilot_approval_deadline_hours,
        now,
      })
      if (action === 'wait') continue
      if (action === 'publish') {
        await systemApprove(p.id, 'Autopilot: rok za odobrenje je istekao, brend je podešen da objavi')
        await systemSchedule(p.id, 'Autopilot: zakazano bez odobrenja po podešavanju brenda')
        await notify(
          p.brand_id,
          p.workspace_id,
          p.id,
          'autopilot_deadline',
          'Autopilot objava je zakazana bez odobrenja',
          `${title}: rok je istekao, a brend je podešen da objavljuje neodobrene objave.`,
          'published',
        )
        summary.published += 1
      } else if (action === 'skip') {
        await systemCancel(p.id, 'Autopilot: rok za odobrenje je istekao, objava je preskočena')
        await notify(
          p.brand_id,
          p.workspace_id,
          p.id,
          'autopilot_skipped',
          'Autopilot objava je preskočena',
          `${title}: nije odobrena na vreme.`,
          'skipped',
        )
        summary.skipped += 1
      } else if (action === 'remind') {
        const { count } = await admin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'autopilot_deadline')
          .contains('data', { postId: p.id, kind: 'remind' })
        if (!count) {
          await notify(
            p.brand_id,
            p.workspace_id,
            p.id,
            'autopilot_deadline',
            'Objava čeka odobrenje, termin se bliži',
            `${title}: odobrite je pre termina, inače se vraća u nacrt.`,
            'remind',
          )
          summary.reminded += 1
        }
      } else if (action === 'expire') {
        await systemWithdraw(p.id, 'Autopilot: termin je prošao bez odobrenja')
        await notify(
          p.brand_id,
          p.workspace_id,
          p.id,
          'autopilot_skipped',
          'Termin Autopilot objave je prošao',
          `${title}: vraćena je u nacrt; zakažite je za novi termin.`,
          'expired',
        )
        summary.expired += 1
      }
    } catch (error) {
      summary.errors += 1
      logger.warn('autopilot_deadline_failed', {
        postId: p.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (Object.values(summary).some((n) => n > 0)) logger.info('autopilot_deadlines', { ...summary })
  return summary
}
