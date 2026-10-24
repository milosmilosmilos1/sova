import 'server-only'

import type { NotificationType } from '@/config/notifications'
import { PLATFORMS, validateText, type SocialPlatform } from '@/config/platforms'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership, type Membership } from '@/lib/auth/workspace'
import { enqueueTargetScheduled, enqueueTargetUnscheduled } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import {
  checkAction,
  targetStatusFor,
  validateScheduleTime,
  type PostAction,
  type PostStatus,
} from '@/lib/posts/state-machine'
import type { ScheduleInput } from '@/lib/schemas/posts'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { connectKeyFor, providerFor } from '@/integrations/social/registry'
import type { NormalizedPost } from '@/integrations/social/types'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import { getPostView, loadPost, type PostRow, type PostView } from '@/services/posts/posts'
import { loadAccountRow, refFor } from '@/services/social/account-rows'

/**
 * Radnje nad objavom (brif 9, SCHEMA „Dozvoljeni prelazi”): sve idu kroz RPC `transition_post`
 * (service role) koji proverava matricu, verziju i piše `post_versions`; ovde su uloge, validacija
 * sadržaja po mreži, targeti i obaveštenja.
 */
interface ActorContext {
  post: PostRow
  membership: Membership
}

async function actor(viewer: Viewer, postId: string, action: PostAction): Promise<ActorContext> {
  const post = await loadPost(viewer, postId)
  const membership = await requireMembership(viewer, post.workspace_id)
  const check = checkAction(action, post.status, membership.role)
  if (!check.ok) throw new ApiError(check.reason === 'role' ? 'FORBIDDEN' : 'CONFLICT', check.message)
  return { post, membership }
}

async function transition(
  postId: string,
  to: PostStatus,
  expectedVersion: number,
  actorId: string,
  summary: string,
): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('transition_post', {
    p_post_id: postId,
    p_to: to,
    p_expected_version: expectedVersion,
    p_actor: actorId,
    p_summary: summary,
  })
  if (error) throw mapDbError(error)
  return data ?? expectedVersion + 1
}

async function setTargetsStatus(
  postId: string,
  postStatus: PostStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin.from('post_targets').select('id, status').eq('post_id', postId)
  for (const t of targets ?? []) {
    const next = targetStatusFor(postStatus, t.status)
    if (next === t.status && !Object.keys(extra).length) continue
    const { error } = await admin
      .from('post_targets')
      .update({ status: next, ...extra })
      .eq('id', t.id)
    if (error) logger.warn('target_status_update_failed', { targetId: t.id, next, error })
  }
}

export interface ContentProblem {
  socialAccountId: string
  platform: string
  problems: string[]
}

const DUPLICATE_WINDOW_MS = 30 * 86_400_000
const normalizeText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Mreže koje identičan tekst odbijaju greškom (Facebook #506, LinkedIn DUPLICATE_POST, X 187). */
const DUPLICATE_REJECTING: ReadonlySet<string> = new Set(['facebook', 'linkedin', 'x'])

/**
 * Isti tekst na istom nalogu u poslednjih 30 dana ili već zakazan (EDGE_CASES K9). Proverava se samo
 * za mreže iz `DUPLICATE_REJECTING`, pa se problem javlja pre zakazivanja, ne posle pada objave;
 * Instagram i TikTok isti opis uz drugu sliku primaju (D-081).
 */
async function findDuplicateOnAccount(
  socialAccountId: string,
  text: string,
  postId: string,
): Promise<{ status: string; at: string | null } | null> {
  const want = normalizeText(text)
  if (want.length < 20) return null
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('post_targets')
    .select('status, text_content, scheduled_at, published_at, posts!inner(master_text)')
    .eq('social_account_id', socialAccountId)
    .in('status', ['published', 'scheduled', 'publishing'])
    .neq('post_id', postId)
    .or(`published_at.gte."${since}",scheduled_at.gte."${since}"`)
    .limit(200)
  for (const r of data ?? []) {
    const posts = r.posts as unknown as { master_text: string } | null
    const effective = r.text_content || posts?.master_text || ''
    if (normalizeText(effective) === want) return { status: r.status, at: r.published_at ?? r.scheduled_at }
  }
  return null
}

/** Validacija sadržaja po mreži (dužina, hashtagovi, mediji) pre odobrenja ili zakazivanja. */
export async function validatePostContent(
  viewer: Viewer,
  postId: string,
): Promise<{ ok: boolean; problems: ContentProblem[] }> {
  const view = await getPostView(viewer, postId)
  const problems: ContentProblem[] = []
  if (!view.targets.length) {
    return {
      ok: false,
      problems: [{ socialAccountId: '', platform: '', problems: ['Izaberite bar jednu mrežu.'] }],
    }
  }
  for (const t of view.targets) {
    const list: string[] = []
    const media = view.media.filter((m) => !m.socialAccountId || m.socialAccountId === t.socialAccountId)
    if (!t.text.trim() && !media.length) list.push('Objava nema ni tekst ni medij.')
    const text = validateText(t.platform, t.text)
    list.push(...text.problems)
    if (t.accountStatus && t.accountStatus !== 'active')
      list.push(`Nalog nije aktivan (${t.accountStatus}); povežite ga ponovo pre objave.`)
    const duplicate = DUPLICATE_REJECTING.has(t.platform)
      ? await findDuplicateOnAccount(t.socialAccountId, t.text, postId)
      : null
    if (duplicate) {
      const label = PLATFORMS[t.platform as SocialPlatform]?.label ?? t.platform
      const when = duplicate.at ? new Date(duplicate.at).toLocaleDateString('sr-Latn-RS') : ''
      list.push(
        `Isti tekst je ${duplicate.status === 'published' ? 'već objavljen' : 'već zakazan'} na ovom nalogu${when ? ` (${when})` : ''}; ${label} odbija identične objave. Izmenite tekst.`,
      )
    }
    try {
      const row = await loadAccountRow(t.socialAccountId)
      if (row && connectKeyFor(row.platform)) {
        const normalized: NormalizedPost = {
          text: t.text,
          link: view.linkUrl,
          media: media.map((m) => ({
            url: m.url ?? '',
            mimeType: m.mimeType ?? 'image/jpeg',
            width: m.width,
            height: m.height,
            alt: m.altText,
            assetId: m.mediaAssetId,
            durationMs: m.durationMs,
            sizeBytes: m.sizeBytes,
          })),
          firstComment: view.firstComment,
          isAiGenerated: false,
          clientKey: t.id,
          title: view.title,
          options: t.options,
        }
        list.push(
          ...providerFor(row.platform)
            .validatePost(normalized, refFor(row))
            .problems.filter((p) => !text.problems.includes(p)),
        )
      }
    } catch (error) {
      logger.warn('validate_post_provider_failed', { targetId: t.id, error })
    }
    if (list.length)
      problems.push({ socialAccountId: t.socialAccountId, platform: t.platform, problems: list })
  }
  return { ok: problems.length === 0, problems }
}

async function notifyApprovers(post: PostRow, byUserId: string): Promise<void> {
  const approvers = (
    await usersWithRoles(post.workspace_id, post.brand_id, ['owner', 'admin', 'approver'])
  ).filter((id) => id !== byUserId)
  await notifyUsers({
    userIds: approvers,
    workspaceId: post.workspace_id,
    brandId: post.brand_id,
    type: 'post_review_requested',
    title: 'Objava čeka odobrenje',
    body: (post.title ?? post.master_text).slice(0, 140),
    link: `/app/posts/${post.id}`,
    data: { postId: post.id },
    email: true,
  })
}

async function notifyAuthor(
  post: PostRow,
  type: NotificationType,
  title: string,
  body: string | null,
  byUserId: string | null,
): Promise<void> {
  if (!post.created_by || post.created_by === byUserId) return
  await notifyUsers({
    userIds: [post.created_by],
    workspaceId: post.workspace_id,
    brandId: post.brand_id,
    type,
    title,
    body,
    link: `/app/posts/${post.id}`,
    data: { postId: post.id },
    email: true,
  })
}

export async function submitForReview(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  const { post } = await actor(viewer, postId, 'submit')
  const validation = await validatePostContent(viewer, postId)
  if (!validation.ok)
    throw new ApiError('VALIDATION', 'Objava nije spremna za odobravanje.', {
      details: { problems: validation.problems },
    })
  const newVersion = await transition(postId, 'in_review', version, viewer.user.id, 'poslato na odobrenje')
  const admin = createSupabaseAdminClient()
  await admin.from('approvals').insert({
    post_id: postId,
    brand_id: post.brand_id,
    workspace_id: post.workspace_id,
    step: 1,
    requested_by: viewer.user.id,
    post_version: newVersion,
  })
  await notifyApprovers(post, viewer.user.id)
  return getPostView(viewer, postId)
}

export async function withdrawFromReview(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  await actor(viewer, postId, 'withdraw')
  await transition(postId, 'draft', version, viewer.user.id, 'povučeno sa odobravanja')
  return getPostView(viewer, postId)
}

export type Decision = 'approved' | 'rejected' | 'changes_requested'

export async function decidePost(
  viewer: Viewer,
  postId: string,
  version: number,
  decision: Decision,
  comment: string | null,
): Promise<PostView> {
  const action: PostAction =
    decision === 'approved' ? 'approve' : decision === 'rejected' ? 'reject' : 'request_changes'
  const { post } = await actor(viewer, postId, action)
  if (decision !== 'approved' && !comment?.trim()) {
    throw new ApiError('VALIDATION', 'Upišite razlog da autor zna šta da promeni.', {
      fields: { comment: ['obavezno'] },
    })
  }
  const admin = createSupabaseAdminClient()
  const { error } = await admin.rpc('decide_post', {
    p_post_id: postId,
    p_decision: decision,
    p_comment: comment ?? '',
    p_post_version: version,
    p_actor: viewer.user.id,
    p_step: 1,
  })
  if (error) throw mapDbError(error)
  if (comment?.trim()) {
    await admin
      .from('post_comments')
      .insert({ post_id: postId, brand_id: post.brand_id, author_id: viewer.user.id, body: comment.trim() })
  }
  const titles: Record<Decision, string> = {
    approved: 'Objava je odobrena',
    rejected: 'Objava je odbijena',
    changes_requested: 'Traže se izmene objave',
  }
  await notifyAuthor(post, `post_${decision}`, titles[decision], comment, viewer.user.id)
  return getPostView(viewer, postId)
}

function conflictFromSameMinute(error: unknown): ApiError | null {
  const code = (error as { code?: string } | null)?.code
  const msg = (error as { message?: string } | null)?.message ?? ''
  if (code === '23505' && msg.includes('post_targets_no_same_minute')) {
    return new ApiError(
      'CONFLICT',
      'Na tom nalogu već postoji objava u istom minutu. Pomerite termin za bar jedan minut.',
      { details: { suggestion: 'plus_1_min' } },
    )
  }
  return null
}

/** Zakazivanje: vreme u budućnosti, nalozi aktivni, sadržaj validan, isti minut po nalogu zabranjen (K8). */
export async function schedulePost(viewer: Viewer, postId: string, input: ScheduleInput): Promise<PostView> {
  await actor(viewer, postId, 'schedule')
  const when = new Date(input.scheduledFor)
  const timeCheck = validateScheduleTime(when)
  if (!timeCheck.ok)
    throw new ApiError('VALIDATION', timeCheck.message, {
      fields: { scheduledFor: [timeCheck.message] },
      details: { hint: 'publish_now' },
    })
  for (const [, t] of Object.entries(input.targetTimes ?? {})) {
    const c = validateScheduleTime(new Date(t))
    if (!c.ok) throw new ApiError('VALIDATION', c.message)
  }
  const validation = await validatePostContent(viewer, postId)
  if (!validation.ok)
    throw new ApiError('VALIDATION', 'Objava nije spremna za zakazivanje.', {
      details: { problems: validation.problems },
    })

  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, status, social_account_id')
    .eq('post_id', postId)
  if (!targets?.length) throw new ApiError('VALIDATION', 'Izaberite bar jednu mrežu.')
  const planned: Array<{ id: string; at: string; accountId: string }> = []
  for (const t of targets) {
    if (t.status === 'published' || t.status === 'publishing') continue
    const at = input.targetTimes?.[t.social_account_id] ?? when.toISOString()
    const { error } = await admin
      .from('post_targets')
      .update({ scheduled_at: at, status: 'scheduled', last_error_code: null, last_error_message: null })
      .eq('id', t.id)
    if (error) {
      const conflict = conflictFromSameMinute(error)
      // vrati već zakazane targete u pending da objava ostane konzistentna
      for (const p of planned)
        await admin.from('post_targets').update({ status: 'pending', scheduled_at: null }).eq('id', p.id)
      throw conflict ?? mapDbError(error)
    }
    planned.push({ id: t.id, at, accountId: t.social_account_id })
  }
  const newVersion = await transition(
    postId,
    'scheduled',
    input.version,
    viewer.user.id,
    `zakazano za ${when.toISOString()}`,
  )
  await admin.from('posts').update({ scheduled_for: when.toISOString() }).eq('id', postId)
  for (const p of planned) {
    try {
      await enqueueTargetScheduled(p.id, p.at, newVersion, p.accountId)
    } catch (error) {
      logger.error('schedule_enqueue_failed', { postId, targetId: p.id, error })
      throw error
    }
  }
  logger.info('post_scheduled', {
    postId,
    targets: planned.length,
    at: when.toISOString(),
    by: viewer.user.id,
  })
  return getPostView(viewer, postId)
}

/** „Objavi sada” = zakazivanje za sledeći pun minut (publisher ga odmah uzima). */
export async function publishNow(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  const at = new Date(Math.ceil((Date.now() + 15_000) / 60_000) * 60_000)
  return schedulePost(viewer, postId, { version, scheduledFor: at.toISOString() })
}

async function unscheduleTargets(postId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, status')
    .eq('post_id', postId)
    .in('status', ['scheduled', 'paused', 'needs_reauth', 'publishing'])
  for (const t of targets ?? []) await enqueueTargetUnscheduled(t.id)
}

export async function unschedulePost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  await actor(viewer, postId, 'unschedule')
  await unscheduleTargets(postId)
  await transition(postId, 'draft', version, viewer.user.id, 'zakazivanje otkazano')
  await setTargetsStatus(postId, 'draft', { scheduled_at: null })
  return getPostView(viewer, postId)
}

export async function pausePost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  await actor(viewer, postId, 'pause')
  await unscheduleTargets(postId)
  await transition(postId, 'paused', version, viewer.user.id, 'pauzirano')
  await setTargetsStatus(postId, 'paused')
  return getPostView(viewer, postId)
}

export async function resumePost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  const { post } = await actor(viewer, postId, 'resume')
  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, scheduled_at, status, social_account_id')
    .eq('post_id', postId)
    .eq('status', 'paused')
  const when = post.scheduled_for ? new Date(post.scheduled_for) : null
  if (!when || !validateScheduleTime(when).ok) {
    throw new ApiError('VALIDATION', 'Termin je prošao dok je objava bila pauzirana. Zakažite je ponovo.', {
      details: { hint: 'reschedule' },
    })
  }
  const newVersion = await transition(postId, 'scheduled', version, viewer.user.id, 'nastavljeno')
  for (const t of targets ?? []) {
    await admin.from('post_targets').update({ status: 'scheduled' }).eq('id', t.id)
    await enqueueTargetScheduled(t.id, t.scheduled_at ?? when.toISOString(), newVersion, t.social_account_id)
  }
  return getPostView(viewer, postId)
}

export async function cancelPost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  await actor(viewer, postId, 'cancel')
  await unscheduleTargets(postId)
  await transition(postId, 'canceled', version, viewer.user.id, 'otkazano')
  await setTargetsStatus(postId, 'canceled')
  return getPostView(viewer, postId)
}

export async function restorePost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  await actor(viewer, postId, 'restore')
  await transition(postId, 'draft', version, viewer.user.id, 'vraćeno u nacrt')
  const admin = createSupabaseAdminClient()
  // otkazani targeti nemaju prelaz nazad; brišu se i prave ponovo pri sledećoj izmeni
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, status, social_account_id, platform, brand_id, text_content, options')
    .eq('post_id', postId)
  for (const t of targets ?? []) {
    if (t.status === 'canceled') {
      await admin.from('post_targets').delete().eq('id', t.id)
      await admin.from('post_targets').insert({
        post_id: postId,
        brand_id: t.brand_id,
        social_account_id: t.social_account_id,
        platform: t.platform,
        text_content: t.text_content,
        options: t.options,
      })
    }
  }
  return getPostView(viewer, postId)
}
