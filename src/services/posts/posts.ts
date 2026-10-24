import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getMembership, requireMembership, type Membership } from '@/lib/auth/workspace'
import {
  availableActions,
  checkAction,
  statusLabel,
  type PostAction,
  type PostStatus,
} from '@/lib/posts/state-machine'
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from '@/lib/schemas/posts'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand, type BrandRow } from '@/services/brands'
import { signedUrl } from '@/services/media'
import type { Database, Json } from '@/types/database'

/**
 * Objave (faza 9a): jedna objava = master tekst + target po nalogu mreže (sa svojim tekstom)
 * + mediji. Svaka izmena nosi `version` (optimistic lock → 409) i snimak u `post_versions`.
 * Čitanje ide kroz korisnikov klijent (RLS), upis kroz service role posle eksplicitne provere uloge.
 */
export type PostRow = Database['public']['Tables']['posts']['Row']
export type TargetRow = Database['public']['Tables']['post_targets']['Row']

export interface PostTargetView {
  id: string
  socialAccountId: string
  platform: TargetRow['platform']
  accountName: string | null
  accountUsername: string | null
  accountStatus: string | null
  assistedOnly: boolean
  text: string
  usesMaster: boolean
  options: Record<string, Json>
  scheduledAt: string | null
  status: TargetRow['status']
  externalPostId: string | null
  permalink: string | null
  lastErrorMessage: string | null
  publishedAt: string | null
}

export interface PostMediaView {
  id: string
  mediaAssetId: string
  sortOrder: number
  socialAccountId: string | null
  url: string | null
  width: number | null
  height: number | null
  mimeType: string | null
  altText: string | null
  source: string | null
  attributionText: string | null
}

export interface PostView {
  id: string
  brandId: string
  workspaceId: string
  title: string | null
  masterText: string
  status: PostStatus
  statusLabel: string
  source: PostRow['source']
  firstComment: string | null
  linkUrl: string | null
  utm: Record<string, string> | null
  language: string | null
  scheduledFor: string | null
  version: number
  lockedAt: string | null
  isEvergreen: boolean
  evergreenIntervalDays: number | null
  pillarId: string | null
  campaignId: string | null
  qaReport: Json | null
  similarityWarning: Json | null
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  targets: PostTargetView[]
  media: PostMediaView[]
  actions: PostAction[]
}

export interface PostListItem {
  id: string
  title: string | null
  masterText: string
  status: PostStatus
  statusLabel: string
  source: PostRow['source']
  scheduledFor: string | null
  version: number
  updatedAt: string
  createdAt: string
  platforms: TargetRow['platform'][]
  targetStatuses: TargetRow['status'][]
  mediaCount: number
  thumbnailUrl: string | null
}

async function brandAndRole(
  viewer: Viewer,
  brandId: string,
  roles?: Membership['role'][],
): Promise<{ brand: BrandRow; membership: Membership }> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id, roles)
  return { brand, membership }
}

async function loadPost(viewer: Viewer, postId: string): Promise<PostRow> {
  return unwrap(
    await viewer.supabase.from('posts').select('*').eq('id', postId).is('deleted_at', null).maybeSingle(),
    'Objava ne postoji ili nemate pristup.',
  )
}

async function accountMap(viewer: Viewer, brandId: string) {
  const { data } = await viewer.supabase
    .from('social_accounts_public')
    .select('id, platform, name, username, status, assisted_only')
    .eq('brand_id', brandId)
  return new Map((data ?? []).map((a) => [a.id!, a]))
}

export async function getPostView(viewer: Viewer, postId: string): Promise<PostView> {
  const post = await loadPost(viewer, postId)
  const membership = await requireMembership(viewer, post.workspace_id)
  const [targetsRes, mediaRes, accounts] = await Promise.all([
    viewer.supabase
      .from('post_targets')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }),
    viewer.supabase
      .from('post_media')
      .select(
        'id, media_asset_id, sort_order, target_id, media_assets(id, bucket, storage_path, width, height, mime_type, alt_text, source, attribution)',
      )
      .eq('post_id', postId)
      .order('sort_order', { ascending: true }),
    accountMap(viewer, post.brand_id),
  ])
  if (targetsRes.error) throw mapDbError(targetsRes.error)
  if (mediaRes.error) throw mapDbError(mediaRes.error)
  const targets: PostTargetView[] = (targetsRes.data ?? []).map((t) => {
    const acc = accounts.get(t.social_account_id)
    return {
      id: t.id,
      socialAccountId: t.social_account_id,
      platform: t.platform,
      accountName: acc?.name ?? null,
      accountUsername: acc?.username ?? null,
      accountStatus: acc?.status ?? null,
      assistedOnly: Boolean(acc?.assisted_only),
      text: t.text_content || post.master_text,
      usesMaster: !t.text_content,
      options: (t.options as Record<string, Json>) ?? {},
      scheduledAt: t.scheduled_at,
      status: t.status,
      externalPostId: t.external_post_id,
      permalink: t.permalink,
      lastErrorMessage: t.last_error_message,
      publishedAt: t.published_at,
    }
  })
  const targetByAccount = new Map(targets.map((t) => [t.id, t.socialAccountId]))
  const media: PostMediaView[] = await Promise.all(
    (mediaRes.data ?? []).map(async (m) => {
      const a = m.media_assets
      const attr = (a?.attribution as { text?: string } | null) ?? null
      return {
        id: m.id,
        mediaAssetId: m.media_asset_id,
        sortOrder: m.sort_order,
        socialAccountId: m.target_id ? (targetByAccount.get(m.target_id) ?? null) : null,
        url: a ? await signedUrl(a) : null,
        width: a?.width ?? null,
        height: a?.height ?? null,
        mimeType: a?.mime_type ?? null,
        altText: a?.alt_text ?? null,
        source: a?.source ?? null,
        attributionText: attr?.text ?? null,
      }
    }),
  )
  return toView(post, targets, media, membership.role)
}

function toView(
  post: PostRow,
  targets: PostTargetView[],
  media: PostMediaView[],
  role: Membership['role'],
): PostView {
  return {
    id: post.id,
    brandId: post.brand_id,
    workspaceId: post.workspace_id,
    title: post.title,
    masterText: post.master_text,
    status: post.status,
    statusLabel: statusLabel(post.status),
    source: post.source,
    firstComment: post.first_comment,
    linkUrl: post.link_url,
    utm: (post.utm as Record<string, string> | null) ?? null,
    language: post.language,
    scheduledFor: post.scheduled_for,
    version: post.version,
    lockedAt: post.locked_at,
    isEvergreen: post.is_evergreen,
    evergreenIntervalDays: post.evergreen_interval_days,
    pillarId: post.pillar_id,
    campaignId: post.campaign_id,
    qaReport: post.qa_report,
    similarityWarning: post.similarity_warning,
    submittedAt: post.submitted_at,
    approvedAt: post.approved_at,
    approvedBy: post.approved_by,
    createdBy: post.created_by,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    targets,
    media,
    actions: availableActions(post.status, role),
  }
}

export async function listPosts(
  viewer: Viewer,
  query: ListPostsQuery,
): Promise<{ items: PostListItem[]; total: number; page: number; pageSize: number }> {
  await brandAndRole(viewer, query.brandId)
  let q = viewer.supabase
    .from('posts')
    .select('id, title, master_text, status, source, scheduled_for, version, updated_at, created_at', {
      count: 'exact',
    })
    .eq('brand_id', query.brandId)
    .is('deleted_at', null)
  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as PostStatus[]
    if (statuses.length === 1) q = q.eq('status', statuses[0]!)
    else if (statuses.length > 1) q = q.in('status', statuses)
  }
  if (query.from) q = q.gte('scheduled_for', query.from)
  if (query.to) q = q.lte('scheduled_for', query.to)
  if (query.q) q = q.ilike('master_text', `%${query.q.replace(/[%_]/g, '')}%`)
  const fromIdx = (query.page - 1) * query.pageSize
  const { data, error, count } = await q
    .order('updated_at', { ascending: false })
    .range(fromIdx, fromIdx + query.pageSize - 1)
  if (error) throw mapDbError(error)
  const ids = (data ?? []).map((p) => p.id)
  const targetsBy = new Map<string, Array<{ platform: TargetRow['platform']; status: TargetRow['status'] }>>()
  const mediaBy = new Map<string, { count: number; first: { bucket: string; storage_path: string } | null }>()
  if (ids.length) {
    const [t, m] = await Promise.all([
      viewer.supabase.from('post_targets').select('post_id, platform, status').in('post_id', ids),
      viewer.supabase
        .from('post_media')
        .select('post_id, sort_order, media_assets(bucket, storage_path)')
        .in('post_id', ids)
        .order('sort_order', { ascending: true }),
    ])
    for (const row of t.data ?? [])
      targetsBy.set(row.post_id, [
        ...(targetsBy.get(row.post_id) ?? []),
        { platform: row.platform, status: row.status },
      ])
    for (const row of m.data ?? []) {
      const cur = mediaBy.get(row.post_id) ?? { count: 0, first: null }
      cur.count++
      if (!cur.first && row.media_assets) cur.first = row.media_assets
      mediaBy.set(row.post_id, cur)
    }
  }
  const items: PostListItem[] = await Promise.all(
    (data ?? []).map(async (p) => {
      const t = targetsBy.get(p.id) ?? []
      const m = mediaBy.get(p.id)
      return {
        id: p.id,
        title: p.title,
        masterText: p.master_text,
        status: p.status,
        statusLabel: statusLabel(p.status),
        source: p.source,
        scheduledFor: p.scheduled_for,
        version: p.version,
        updatedAt: p.updated_at,
        createdAt: p.created_at,
        platforms: [...new Set(t.map((x) => x.platform))],
        targetStatuses: t.map((x) => x.status),
        mediaCount: m?.count ?? 0,
        thumbnailUrl: m?.first ? await signedUrl(m.first) : null,
      }
    }),
  )
  return { items, total: count ?? items.length, page: query.page, pageSize: query.pageSize }
}

async function assertAccounts(
  viewer: Viewer,
  brandId: string,
  ids: string[],
): Promise<Map<string, { platform: TargetRow['platform']; status: string }>> {
  if (!ids.length) return new Map()
  const { data, error } = await viewer.supabase
    .from('social_accounts_public')
    .select('id, platform, status')
    .eq('brand_id', brandId)
    .in('id', ids)
  if (error) throw mapDbError(error)
  const map = new Map((data ?? []).map((a) => [a.id!, { platform: a.platform!, status: a.status! }]))
  const missing = ids.filter((id) => !map.has(id))
  if (missing.length)
    throw new ApiError('VALIDATION', 'Neki od izabranih naloga ne pripadaju ovom brendu.', {
      fields: { targets: missing },
    })
  return map
}

async function assertMedia(viewer: Viewer, brandId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { data, error } = await viewer.supabase
    .from('media_assets')
    .select('id, kind, brand_id, workspace_id')
    .in('id', ids)
    .is('deleted_at', null)
  if (error) throw mapDbError(error)
  const found = new Set((data ?? []).filter((m) => !m.brand_id || m.brand_id === brandId).map((m) => m.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length)
    throw new ApiError('VALIDATION', 'Neki od medija ne postoje ili pripadaju drugom brendu.', {
      fields: { media: missing },
    })
}

async function snapshotVersion(
  postId: string,
  version: number,
  summary: string,
  actor: string | null,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const [{ data: post }, { data: targets }, { data: media }] = await Promise.all([
    admin
      .from('posts')
      .select('title, master_text, status, first_comment, link_url, utm, scheduled_for')
      .eq('id', postId)
      .single(),
    admin
      .from('post_targets')
      .select('id, social_account_id, platform, text_content, options, scheduled_at, status')
      .eq('post_id', postId),
    admin.from('post_media').select('media_asset_id, sort_order, target_id').eq('post_id', postId),
  ])
  await admin.from('post_versions').upsert(
    {
      post_id: postId,
      version,
      snapshot: { ...post, targets: targets ?? [], media: media ?? [] } as unknown as NonNullable<Json>,
      change_summary: summary,
      changed_by: actor,
    },
    { onConflict: 'post_id,version' },
  )
}

export async function createPost(viewer: Viewer, input: CreatePostInput): Promise<PostView> {
  const { brand } = await brandAndRole(viewer, input.brandId, EDIT_ROLES)
  const accounts = await assertAccounts(
    viewer,
    brand.id,
    input.targets.map((t) => t.socialAccountId),
  )
  await assertMedia(
    viewer,
    brand.id,
    input.media.map((m) => m.mediaAssetId),
  )
  const admin = createSupabaseAdminClient()
  const inserted = unwrap(
    await admin
      .from('posts')
      .insert({
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        title: input.title ?? null,
        master_text: input.masterText,
        source: input.source,
        first_comment: input.firstComment ?? null,
        link_url: input.linkUrl ?? null,
        utm: (input.utm as Json | undefined) ?? null,
        language: input.language ?? brand.content_locale,
        scheduled_for: input.scheduledFor ?? null,
        pillar_id: input.pillarId ?? null,
        campaign_id: input.campaignId ?? null,
        is_evergreen: input.isEvergreen ?? false,
        evergreen_interval_days: input.evergreenIntervalDays ?? null,
        created_by: viewer.user.id,
      })
      .select('*')
      .single(),
    'Objava nije sačuvana.',
  )
  await writeTargets(inserted.id, brand.id, input.targets, accounts)
  await writeMedia(inserted.id, input.media)
  await snapshotVersion(inserted.id, 1, 'kreirano', viewer.user.id)
  return getPostView(viewer, inserted.id)
}

async function writeTargets(
  postId: string,
  brandId: string,
  targets: CreatePostInput['targets'],
  accounts: Map<string, { platform: TargetRow['platform']; status: string }>,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin
    .from('post_targets')
    .select('id, social_account_id, status')
    .eq('post_id', postId)
  const wanted = new Map(targets.map((t) => [t.socialAccountId, t]))
  for (const e of existing ?? []) {
    if (!wanted.has(e.social_account_id)) {
      if (e.status === 'published' || e.status === 'publishing') continue
      await admin.from('post_targets').delete().eq('id', e.id)
    }
  }
  const existingBy = new Map((existing ?? []).map((e) => [e.social_account_id, e]))
  for (const t of targets) {
    const acc = accounts.get(t.socialAccountId)!
    const payload = { text_content: t.text ?? '', options: (t.options as Json | undefined) ?? {} }
    const prev = existingBy.get(t.socialAccountId)
    if (prev) {
      const { error } = await admin.from('post_targets').update(payload).eq('id', prev.id)
      if (error) throw mapDbError(error)
    } else {
      const { error } = await admin.from('post_targets').insert({
        post_id: postId,
        brand_id: brandId,
        social_account_id: t.socialAccountId,
        platform: acc.platform,
        ...payload,
      })
      if (error) throw mapDbError(error)
    }
  }
}

async function writeMedia(postId: string, media: CreatePostInput['media']): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: targets } = await admin
    .from('post_targets')
    .select('id, social_account_id')
    .eq('post_id', postId)
  const targetByAccount = new Map((targets ?? []).map((t) => [t.social_account_id, t.id]))
  await admin.from('post_media').delete().eq('post_id', postId)
  if (!media.length) return
  const rows = media.map((m, i) => ({
    post_id: postId,
    media_asset_id: m.mediaAssetId,
    sort_order: m.sortOrder ?? i,
    target_id: m.socialAccountId ? (targetByAccount.get(m.socialAccountId) ?? null) : null,
    crop: null,
  }))
  const { error } = await admin.from('post_media').insert(rows)
  if (error) throw mapDbError(error)
}

/** Izmena sadržaja: `version` mora da se poklapa (409 inače); odobrena objava se vraća u nacrt. */
export async function updatePost(viewer: Viewer, postId: string, input: UpdatePostInput): Promise<PostView> {
  const post = await loadPost(viewer, postId)
  const membership = await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const check = checkAction('edit', post.status, membership.role)
  if (!check.ok) throw new ApiError('CONFLICT', check.message)
  if (post.locked_at) throw new ApiError('POST_LOCKED')
  if (post.version !== input.version) {
    throw new ApiError(
      'CONFLICT',
      'Objavu je u međuvremenu neko izmenio. Osvežite je pa unesite izmene ponovo.',
      {
        details: { currentVersion: post.version },
      },
    )
  }
  if (input.targets)
    await assertAccounts(
      viewer,
      post.brand_id,
      input.targets.map((t) => t.socialAccountId),
    )
  if (input.media)
    await assertMedia(
      viewer,
      post.brand_id,
      input.media.map((m) => m.mediaAssetId),
    )

  const admin = createSupabaseAdminClient()
  const patch: Database['public']['Tables']['posts']['Update'] = { version: post.version + 1 }
  if (input.title !== undefined) patch.title = input.title
  if (input.masterText !== undefined) {
    patch.master_text = input.masterText
    // izveštaj kontrole kvaliteta Autopilota važi samo za tekst koji je proveren
    if (input.masterText !== post.master_text) patch.qa_report = null
  }
  if (input.firstComment !== undefined) patch.first_comment = input.firstComment
  if (input.linkUrl !== undefined) patch.link_url = input.linkUrl
  if (input.utm !== undefined) patch.utm = (input.utm as Json | null) ?? null
  if (input.language !== undefined) patch.language = input.language
  if (input.scheduledFor !== undefined) patch.scheduled_for = input.scheduledFor
  if (input.pillarId !== undefined) patch.pillar_id = input.pillarId
  if (input.campaignId !== undefined) patch.campaign_id = input.campaignId
  if (input.isEvergreen !== undefined) patch.is_evergreen = input.isEvergreen
  if (input.evergreenIntervalDays !== undefined) patch.evergreen_interval_days = input.evergreenIntervalDays
  // izmena sadržaja posle odobrenja ili tokom odobravanja vraća objavu u nacrt (ponovno odobravanje)
  if (post.status === 'approved' || post.status === 'in_review') patch.status = 'draft'

  const { data: updated, error } = await admin
    .from('posts')
    .update(patch)
    .eq('id', postId)
    .eq('version', post.version)
    .select('id')
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!updated)
    throw new ApiError(
      'CONFLICT',
      'Objavu je u međuvremenu neko izmenio. Osvežite je pa unesite izmene ponovo.',
    )

  if (input.targets) {
    const accounts = await assertAccounts(
      viewer,
      post.brand_id,
      input.targets.map((t) => t.socialAccountId),
    )
    await writeTargets(postId, post.brand_id, input.targets, accounts)
  }
  if (input.media) await writeMedia(postId, input.media)
  await snapshotVersion(postId, post.version + 1, input.changeSummary ?? 'izmena', viewer.user.id)
  return getPostView(viewer, postId)
}

export async function deletePost(viewer: Viewer, postId: string): Promise<void> {
  const post = await loadPost(viewer, postId)
  const membership = await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const check = checkAction('delete', post.status, membership.role)
  if (!check.ok) throw new ApiError(check.reason === 'role' ? 'FORBIDDEN' : 'CONFLICT', check.message)
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('posts')
    .update({ deleted_at: new Date().toISOString(), version: post.version + 1 })
    .eq('id', postId)
  if (error) throw mapDbError(error)
}

export async function duplicatePost(viewer: Viewer, postId: string): Promise<PostView> {
  const view = await getPostView(viewer, postId)
  await requireMembership(viewer, view.workspaceId, EDIT_ROLES)
  return createPost(viewer, {
    brandId: view.brandId,
    title: view.title ? `${view.title} (kopija)` : undefined,
    masterText: view.masterText,
    firstComment: view.firstComment ?? undefined,
    linkUrl: view.linkUrl ?? undefined,
    utm: view.utm ?? undefined,
    language: (view.language as 'sr-Latn' | 'sr-Cyrl' | 'en' | null) ?? undefined,
    targets: view.targets.map((t) => ({
      socialAccountId: t.socialAccountId,
      text: t.usesMaster ? undefined : t.text,
      options: t.options,
    })),
    media: view.media.map((m) => ({
      mediaAssetId: m.mediaAssetId,
      sortOrder: m.sortOrder,
      socialAccountId: m.socialAccountId ?? undefined,
    })),
    source: 'manual',
  })
}

export async function listVersions(viewer: Viewer, postId: string) {
  await loadPost(viewer, postId)
  return unwrap(
    await viewer.supabase
      .from('post_versions')
      .select('version, change_summary, changed_by, created_at, snapshot')
      .eq('post_id', postId)
      .order('version', { ascending: false })
      .limit(50),
  )
}

export { loadPost, getMembership }
