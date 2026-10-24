import 'server-only'

import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { shiftToZone } from '@/lib/zoned-time'

/**
 * Promena vremenske zone brenda (EDGE_CASES K7): zakazane objave i planirani termini zadržavaju isto
 * lokalno vreme u novoj zoni (10:00 u Beogradu postaje 10:00 u Njujorku). Inngest run-ovi se
 * otkazuju i zakazuju ponovo; zauzet minut na istom nalogu pomera termin za minut (K8).
 */
export async function shiftBrandSchedule(
  brandId: string,
  fromTimeZone: string,
  toTimeZone: string,
): Promise<{ targets: number; posts: number }> {
  if (fromTimeZone === toTimeZone) return { targets: 0, posts: 0 }
  const admin = createSupabaseAdminClient()
  const nowIso = new Date().toISOString()
  const { data: targets, error } = await admin
    .from('post_targets')
    .select('id, post_id, social_account_id, scheduled_at')
    .eq('brand_id', brandId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', nowIso)
  if (error) throw mapDbError(error)
  let moved = 0
  for (const t of targets ?? []) {
    let when = new Date(shiftToZone(t.scheduled_at!, fromTimeZone, toTimeZone))
    let updated = false
    for (let i = 0; i < 10 && !updated; i++) {
      const { data, error: upErr } = await admin
        .from('post_targets')
        .update({ scheduled_at: when.toISOString() })
        .eq('id', t.id)
        .eq('status', 'scheduled')
        .select('id')
      if (upErr) {
        if (upErr.code !== '23505') throw mapDbError(upErr)
        when = new Date(when.getTime() + 60_000)
        continue
      }
      updated = (data?.length ?? 0) > 0
      break
    }
    if (!updated) continue
    const { data: post } = await admin.from('posts').select('version').eq('id', t.post_id).single()
    await enqueueTargetUnscheduled(t.id)
    await enqueueTargetScheduled(t.id, when.toISOString(), post?.version ?? 1, t.social_account_id)
    moved++
  }
  // planirani termini (nacrti iz strategije i Autopilota i zakazane objave)
  const { data: posts } = await admin
    .from('posts')
    .select('id, scheduled_for')
    .eq('brand_id', brandId)
    .gt('scheduled_for', nowIso)
    .not('status', 'in', '(published,canceled,failed)')
    .is('deleted_at', null)
  for (const p of posts ?? []) {
    await admin
      .from('posts')
      .update({ scheduled_for: shiftToZone(p.scheduled_for!, fromTimeZone, toTimeZone) })
      .eq('id', p.id)
  }
  logger.info('brand_schedule_shifted', {
    brandId,
    fromTimeZone,
    toTimeZone,
    targets: moved,
    posts: posts?.length ?? 0,
  })
  return { targets: moved, posts: posts?.length ?? 0 }
}
