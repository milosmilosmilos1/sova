import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { enqueueTargetScheduled } from '@/lib/jobs/enqueue'
import { nextFullMinute } from '@/lib/posts/publish-rules'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { logAdminAction, type AdminContext } from '@/services/admin/audit'

/**
 * Monitor objava (brif 16): neuspele objave u celom sistemu po mreži i kodu greške, zakasneli
 * targeti i targeti koji čekaju ponovno povezivanje; ručni ponovni pokušaj iz admin panela.
 */
export interface FailedTargetRow {
  id: string
  postId: string
  platform: string
  errorCode: string | null
  errorMessage: string | null
  attempts: number
  updatedAt: string
  scheduledAt: string | null
  postTitle: string | null
  brandName: string | null
  workspaceName: string | null
  status: string
}

export interface PublishMonitor {
  days: number
  groups: Array<{ platform: string; code: string; count: number }>
  total: number
  failed: FailedTargetRow[]
  late: FailedTargetRow[]
  needsReauth: number
}

async function enrich(rows: Array<Record<string, unknown>>): Promise<FailedTargetRow[]> {
  const admin = createSupabaseAdminClient()
  const postIds = [...new Set(rows.map((r) => String(r.post_id)))]
  const brandIds = [...new Set(rows.map((r) => String(r.brand_id)))]
  const [posts, brands] = await Promise.all([
    postIds.length
      ? admin.from('posts').select('id, title, master_text').in('id', postIds)
      : Promise.resolve({ data: [] as never[] }),
    brandIds.length
      ? admin.from('brands').select('id, name, workspaces(name)').in('id', brandIds)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const postById = new Map(
    ((posts.data ?? []) as Array<{ id: string; title: string | null; master_text: string }>).map((p) => [
      p.id,
      p,
    ]),
  )
  const brandById = new Map(
    ((brands.data ?? []) as Array<{ id: string; name: string; workspaces: { name: string } | null }>).map(
      (b) => [b.id, b],
    ),
  )
  return rows.map((r) => {
    const p = postById.get(String(r.post_id))
    const b = brandById.get(String(r.brand_id))
    return {
      id: String(r.id),
      postId: String(r.post_id),
      platform: String(r.platform),
      errorCode: (r.last_error_code as string | null) ?? null,
      errorMessage: (r.last_error_message as string | null) ?? null,
      attempts: Number(r.attempt_count ?? 0),
      updatedAt: String(r.updated_at),
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      postTitle: p ? (p.title ?? p.master_text.slice(0, 80)) : null,
      brandName: b?.name ?? null,
      workspaceName: b?.workspaces?.name ?? null,
      status: String(r.status),
    }
  })
}

export async function getPublishMonitor(
  filters: { platform?: string | null; code?: string | null; days?: number } = {},
): Promise<PublishMonitor> {
  const admin = createSupabaseAdminClient()
  const days = Math.min(Math.max(filters.days ?? 30, 1), 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const cols =
    'id, post_id, brand_id, platform, status, last_error_code, last_error_message, attempt_count, updated_at, scheduled_at'
  const { data: all, error } = await admin
    .from('post_targets')
    .select(cols)
    .eq('status', 'failed')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) throw mapDbError(error)
  const counts = new Map<string, number>()
  for (const r of all ?? []) {
    const key = `${r.platform}|${r.last_error_code ?? 'NEPOZNATO'}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const filtered = (all ?? []).filter(
    (r) =>
      (!filters.platform || r.platform === filters.platform) &&
      (!filters.code || (r.last_error_code ?? 'NEPOZNATO') === filters.code),
  )
  const lateBefore = new Date(Date.now() - 3 * 60_000).toISOString()
  const [{ data: late }, { count: needsReauth }] = await Promise.all([
    admin
      .from('post_targets')
      .select(cols)
      .eq('status', 'scheduled')
      .lt('scheduled_at', lateBefore)
      .order('scheduled_at', { ascending: true })
      .limit(100),
    admin.from('post_targets').select('id', { count: 'exact', head: true }).eq('status', 'needs_reauth'),
  ])
  return {
    days,
    groups: [...counts.entries()]
      .map(([k, count]) => {
        const [platform, code] = k.split('|') as [string, string]
        return { platform, code, count }
      })
      .sort((a, b) => b.count - a.count),
    total: all?.length ?? 0,
    failed: await enrich(filtered.slice(0, 100) as unknown as Array<Record<string, unknown>>),
    late: await enrich((late ?? []) as unknown as Array<Record<string, unknown>>),
    needsReauth: needsReauth ?? 0,
  }
}

/** Ručni ponovni pokušaj iz admin panela: sledeći slobodan minut, objava se vraća u red. */
export async function adminRetryTarget(
  ctx: AdminContext,
  targetId: string,
): Promise<{ scheduledAt: string }> {
  const admin = createSupabaseAdminClient()
  const { data: target } = await admin.from('post_targets').select('*').eq('id', targetId).maybeSingle()
  if (!target) throw new ApiError('NOT_FOUND', 'Target ne postoji.')
  if (target.status !== 'failed' && target.status !== 'needs_reauth') {
    throw new ApiError(
      'CONFLICT',
      `Ponovni pokušaj je moguć samo za neuspele targete (sada: ${target.status}).`,
    )
  }
  const { data: account } = await admin
    .from('social_accounts')
    .select('status, name')
    .eq('id', target.social_account_id)
    .maybeSingle()
  if (!account || account.status !== 'active') {
    throw new ApiError(
      'CONFLICT',
      `Nalog ${account?.name ?? ''} nije aktivan; korisnik mora ponovo da ga poveže.`.replace('  ', ' '),
    )
  }
  const { data: post } = await admin
    .from('posts')
    .select('id, status, version')
    .eq('id', target.post_id)
    .maybeSingle()
  if (!post) throw new ApiError('NOT_FOUND', 'Objava ne postoji.')
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
      .eq('id', targetId)
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
  if (!moved) throw new ApiError('CONFLICT', 'Target je u međuvremenu promenjen.')
  let version = post.version
  if (post.status === 'failed') {
    const { data, error } = await admin.rpc('transition_post', {
      p_post_id: post.id,
      p_to: 'scheduled',
      p_expected_version: post.version,
      p_actor: ctx.adminId,
      p_summary: 'admin: ponovni pokušaj objavljivanja',
    })
    if (error) throw mapDbError(error)
    version = data ?? version
  }
  await enqueueTargetScheduled(targetId, when.toISOString(), version, target.social_account_id)
  await logAdminAction(ctx, {
    action: 'publish.retry',
    targetType: 'post_target',
    targetId,
    before: {
      status: target.status,
      errorCode: target.last_error_code,
      errorMessage: target.last_error_message,
    },
    after: { status: 'scheduled', scheduledAt: when.toISOString() },
  })
  return { scheduledAt: when.toISOString() }
}
