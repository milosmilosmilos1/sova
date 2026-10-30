import 'server-only'

import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { PostStatus } from '@/lib/posts/state-machine'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { notifyUsers, usersWithRoles } from '@/services/notifications'

/**
 * Radnje nad objavom bez korisnika (Autopilot, faza 10c): iste provere kao u `workflow.ts`
 * (prelazi kroz `transition_post`, isti minut po nalogu, događaji publishera), ali kroz service role
 * i sa `actor = null` u `post_versions`. Koriste ih samo servisi Autopilota.
 */
const SYSTEM_ACTOR = null as unknown as string
const NO_VERSION_CHECK = null as unknown as number

export async function systemTransition(postId: string, to: PostStatus, summary: string): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('transition_post', {
    p_post_id: postId,
    p_to: to,
    p_expected_version: NO_VERSION_CHECK,
    p_actor: SYSTEM_ACTOR,
    p_summary: summary,
  })
  if (error) throw mapDbError(error)
  return data ?? 0
}

async function loadPost(postId: string) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from('posts').select('*').eq('id', postId).maybeSingle()
  if (error || !data) throw mapDbError(error, 'Objava ne postoji.')
  return data
}

/** Nacrt → na odobrenje, red u `approvals` i obaveštenje odobravaocima. */
export async function systemSubmitForReview(
  postId: string,
  note: string,
  options: { notify?: boolean } = {},
): Promise<void> {
  const post = await loadPost(postId)
  const version = await systemTransition(postId, 'in_review', note)
  const admin = createSupabaseAdminClient()
  await admin.from('approvals').insert({
    post_id: postId,
    brand_id: post.brand_id,
    workspace_id: post.workspace_id,
    step: 1,
    requested_by: null,
    post_version: version,
  })
  // video iz karusela (D-118) ide u isti red bez novog obaveštenja: napravio ga je onaj ko odlučuje
  if (options.notify === false) return
  const approvers = await usersWithRoles(post.workspace_id, post.brand_id, ['owner', 'admin', 'approver'])
  await notifyUsers({
    userIds: approvers,
    workspaceId: post.workspace_id,
    brandId: post.brand_id,
    type: 'post_review_requested',
    title: 'Autopilot: objava čeka odobrenje',
    body: (post.title ?? post.master_text).slice(0, 140),
    link: `/app/posts/${postId}`,
    data: { postId, autopilot: true },
    email: false,
  })
}

/**
 * Zakazivanje u `posts.scheduled_for`: targeti dobijaju termin (isti minut na nalogu → +1 min),
 * objava prelazi u `scheduled`, publisher dobija događaj po targetu.
 */
export async function systemSchedule(
  postId: string,
  note: string,
): Promise<{ scheduledAt: string; targets: number }> {
  const post = await loadPost(postId)
  if (!post.scheduled_for) throw new Error('Objava nema termin.')
  if (new Date(post.scheduled_for).getTime() < Date.now() + 30_000) throw new Error('Termin je prošao.')
  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, status, social_account_id')
    .eq('post_id', postId)
    .in('status', ['pending', 'failed'])
  if (!targets?.length) throw new Error('Objava nema mreže za objavljivanje.')
  const planned: Array<{ id: string; at: string; accountId: string }> = []
  for (const t of targets) {
    let at = new Date(post.scheduled_for)
    let done = false
    for (let i = 0; i < 10 && !done; i++) {
      const { error } = await admin
        .from('post_targets')
        .update({
          status: 'scheduled',
          scheduled_at: at.toISOString(),
          last_error_code: null,
          last_error_message: null,
        })
        .eq('id', t.id)
      if (!error) {
        done = true
        break
      }
      if (error.code === '23505') {
        at = new Date(at.getTime() + 60_000)
        continue
      }
      throw mapDbError(error)
    }
    if (!done) throw new Error('Nema slobodnog minuta za nalog.')
    planned.push({ id: t.id, at: at.toISOString(), accountId: t.social_account_id })
  }
  const version = await systemTransition(postId, 'scheduled', note)
  for (const p of planned) await enqueueTargetScheduled(p.id, p.at, version, p.accountId)
  logger.info('post_scheduled_by_system', { postId, targets: planned.length, at: post.scheduled_for })
  return { scheduledAt: post.scheduled_for, targets: planned.length }
}

/** Na odobrenju → odobreno (rok je istekao, a brend je podešen da objavi). */
export async function systemApprove(postId: string, comment: string): Promise<void> {
  const post = await loadPost(postId)
  const version = await systemTransition(postId, 'approved', comment)
  const admin = createSupabaseAdminClient()
  await admin.from('approvals').insert({
    post_id: postId,
    brand_id: post.brand_id,
    workspace_id: post.workspace_id,
    step: 1,
    requested_by: null,
    approver_id: null,
    decision: 'approved',
    comment,
    post_version: version,
    decided_at: new Date().toISOString(),
  })
}

/** Na odobrenju → nacrt (termin je prošao ili je objava vraćena). */
export async function systemWithdraw(postId: string, note: string): Promise<void> {
  await systemTransition(postId, 'draft', note)
}

/** Otkazivanje (preskočena Autopilot objava): targeti otkazani, run-ovi otkazani. */
export async function systemCancel(postId: string, note: string): Promise<void> {
  const post = await loadPost(postId)
  const admin = createSupabaseAdminClient()
  if (post.status === 'in_review') await systemTransition(postId, 'draft', note)
  const { data: targets } = await admin.from('post_targets').select('id, status').eq('post_id', postId)
  for (const t of targets ?? []) {
    if (t.status === 'scheduled' || t.status === 'paused') await enqueueTargetUnscheduled(t.id)
    if (['pending', 'scheduled', 'paused', 'needs_reauth', 'failed', 'assisted_pending'].includes(t.status)) {
      await admin.from('post_targets').update({ status: 'canceled' }).eq('id', t.id)
    }
  }
  await systemTransition(postId, 'canceled', note)
}
