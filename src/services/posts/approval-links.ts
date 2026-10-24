import 'server-only'

import { randomBytes } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { sha256Hex } from '@/lib/crypto/tokens'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { CreateApprovalLinkInput } from '@/lib/schemas/posts'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { signedUrl } from '@/services/media'
import { notifyUsers } from '@/services/notifications'
import { getBrand } from '@/services/brands'
import type { Database } from '@/types/database'

/**
 * Javni link za odobravanje (brif 9, ARCHITECTURE 5.2): klijent bez naloga vidi objave na odobrenju
 * i odlučuje; token 32 bajta, u bazi samo SHA-256, rok važenja, broj upotreba, opoziv.
 */
type LinkRow = Database['public']['Tables']['approval_links']['Row']

export interface ApprovalLinkView {
  id: string
  url: string | null
  postIds: string[]
  clientLabel: string | null
  expiresAt: string
  maxUses: number | null
  useCount: number
  revokedAt: string | null
  createdAt: string
}

function toView(row: LinkRow, token?: string): ApprovalLinkView {
  return {
    id: row.id,
    url: token ? `${env.NEXT_PUBLIC_APP_URL}/approve/${token}` : null,
    postIds: row.post_ids,
    clientLabel: row.client_label,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }
}

export async function createApprovalLink(
  viewer: Viewer,
  input: CreateApprovalLinkInput,
): Promise<ApprovalLinkView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { data: posts, error } = await viewer.supabase
    .from('posts')
    .select('id, status')
    .eq('brand_id', brand.id)
    .in('id', input.postIds)
    .is('deleted_at', null)
  if (error) throw mapDbError(error)
  const found = new Set((posts ?? []).map((p) => p.id))
  const missing = input.postIds.filter((id) => !found.has(id))
  if (missing.length)
    throw new ApiError('VALIDATION', 'Neke objave ne postoje ili pripadaju drugom brendu.', {
      fields: { postIds: missing },
    })
  const notInReview = (posts ?? []).filter((p) => p.status !== 'in_review').map((p) => p.id)
  if (notInReview.length) {
    throw new ApiError(
      'VALIDATION',
      'Na javni link idu samo objave koje su „na odobrenju”. Prvo ih pošaljite na odobrenje.',
      { fields: { postIds: notInReview } },
    )
  }
  const token = randomBytes(32).toString('base64url')
  const admin = createSupabaseAdminClient()
  const row = unwrap(
    await admin
      .from('approval_links')
      .insert({
        workspace_id: brand.workspace_id,
        brand_id: brand.id,
        token_hash: sha256Hex(token),
        post_ids: input.postIds,
        client_label: input.clientLabel ?? null,
        created_by: viewer.user.id,
        expires_at: new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString(),
        max_uses: input.maxUses ?? null,
      })
      .select('*')
      .single(),
    'Link nije napravljen.',
  )
  logger.info('approval_link_created', { brandId: brand.id, posts: input.postIds.length, by: viewer.user.id })
  return toView(row, token)
}

export async function listApprovalLinks(viewer: Viewer, brandId: string): Promise<ApprovalLinkView[]> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('approval_links')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw mapDbError(error)
  return (data ?? []).map((r) => toView(r))
}

export async function revokeApprovalLink(viewer: Viewer, linkId: string): Promise<void> {
  const row = unwrap(
    await viewer.supabase
      .from('approval_links')
      .select('id, brand_id, workspace_id')
      .eq('id', linkId)
      .maybeSingle(),
    'Link ne postoji.',
  )
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('approval_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
  if (error) throw mapDbError(error)
}

async function loadLink(token: string): Promise<LinkRow> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('approval_links')
    .select('*')
    .eq('token_hash', sha256Hex(token))
    .maybeSingle()
  if (!data) throw new ApiError('NOT_FOUND', 'Link ne postoji.')
  if (data.revoked_at) throw new ApiError('NOT_FOUND', 'Link je opozvan.')
  if (new Date(data.expires_at).getTime() < Date.now())
    throw new ApiError('NOT_FOUND', 'Link je istekao. Zatražite nov od agencije.')
  if (data.max_uses !== null && data.use_count >= data.max_uses)
    throw new ApiError('NOT_FOUND', 'Link je iskorišćen maksimalan broj puta.')
  return data
}

export interface PublicPostView {
  id: string
  version: number
  status: string
  title: string | null
  text: string
  firstComment: string | null
  linkUrl: string | null
  scheduledFor: string | null
  platforms: string[]
  media: Array<{ url: string; alt: string | null; width: number | null; height: number | null }>
  comments: Array<{ id: string; author: string; body: string; createdAt: string }>
  decided: { decision: string; comment: string | null; at: string } | null
}

export interface PublicApprovalView {
  brandName: string
  clientLabel: string | null
  expiresAt: string
  posts: PublicPostView[]
}

export async function getPublicApproval(token: string): Promise<PublicApprovalView> {
  const link = await loadLink(token)
  const admin = createSupabaseAdminClient()
  const [{ data: brand }, { data: posts }] = await Promise.all([
    admin.from('brands').select('name').eq('id', link.brand_id).single(),
    admin
      .from('posts')
      .select('id, version, status, title, master_text, first_comment, link_url, scheduled_for')
      .in('id', link.post_ids)
      .is('deleted_at', null),
  ])
  const ids = (posts ?? []).map((p) => p.id)
  const [{ data: targets }, { data: media }, { data: comments }, { data: approvals }] = await Promise.all([
    admin.from('post_targets').select('post_id, platform').in('post_id', ids),
    admin
      .from('post_media')
      .select('post_id, sort_order, media_assets(bucket, storage_path, alt_text, width, height)')
      .in('post_id', ids)
      .order('sort_order', { ascending: true }),
    admin
      .from('post_comments')
      .select('id, post_id, author_name, body, created_at, author_id')
      .in('post_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('approvals')
      .select('post_id, decision, comment, decided_at')
      .in('post_id', ids)
      .not('decision', 'is', null)
      .order('decided_at', { ascending: false }),
  ])
  const views: PublicPostView[] = []
  for (const p of posts ?? []) {
    const m = await Promise.all(
      (media ?? [])
        .filter((x) => x.post_id === p.id && x.media_assets)
        .map(async (x) => ({
          url: await signedUrl(x.media_assets!, 24 * 3600),
          alt: x.media_assets!.alt_text,
          width: x.media_assets!.width,
          height: x.media_assets!.height,
        })),
    )
    const decided = (approvals ?? []).find((a) => a.post_id === p.id)
    views.push({
      id: p.id,
      version: p.version,
      status: p.status,
      title: p.title,
      text: p.master_text,
      firstComment: p.first_comment,
      linkUrl: p.link_url,
      scheduledFor: p.scheduled_for,
      platforms: [...new Set((targets ?? []).filter((t) => t.post_id === p.id).map((t) => t.platform))],
      media: m,
      comments: (comments ?? [])
        .filter((c) => c.post_id === p.id)
        .map((c) => ({
          id: c.id,
          author: c.author_name ?? (c.author_id ? 'Tim' : 'Klijent'),
          body: c.body,
          createdAt: c.created_at,
        })),
      decided: decided
        ? { decision: decided.decision!, comment: decided.comment, at: decided.decided_at! }
        : null,
    })
  }
  return {
    brandName: brand?.name ?? 'Brend',
    clientLabel: link.client_label,
    expiresAt: link.expires_at,
    posts: views,
  }
}

export async function decideViaLink(
  token: string,
  input: {
    postId: string
    postVersion: number
    decision: 'approved' | 'rejected' | 'changes_requested'
    comment: string | null
    name: string | null
  },
): Promise<PublicPostView> {
  const link = await loadLink(token)
  if (!link.post_ids.includes(input.postId)) throw new ApiError('NOT_FOUND', 'Objava nije na ovom linku.')
  if (input.decision !== 'approved' && !input.comment?.trim())
    throw new ApiError('VALIDATION', 'Upišite šta treba promeniti.', { fields: { comment: ['obavezno'] } })
  const admin = createSupabaseAdminClient()
  const { error } = await admin.rpc('decide_post', {
    p_post_id: input.postId,
    p_decision: input.decision,
    p_comment: input.comment ?? '',
    p_post_version: input.postVersion,
    p_link_id: link.id,
    p_step: 1,
  })
  if (error) throw mapDbError(error)
  if (input.comment?.trim()) {
    const { data: post } = await admin.from('posts').select('brand_id').eq('id', input.postId).single()
    await admin.from('post_comments').insert({
      post_id: input.postId,
      brand_id: post!.brand_id,
      approval_link_id: link.id,
      author_name: input.name?.trim() || link.client_label || 'Klijent',
      body: input.comment.trim(),
    })
  }
  await admin
    .from('approval_links')
    .update({ use_count: link.use_count + 1 })
    .eq('id', link.id)
  const { data: post } = await admin
    .from('posts')
    .select('id, title, master_text, created_by, workspace_id, brand_id')
    .eq('id', input.postId)
    .single()
  if (post?.created_by) {
    const titles = {
      approved: 'Klijent je odobrio objavu',
      rejected: 'Klijent je odbio objavu',
      changes_requested: 'Klijent traži izmene objave',
    }
    await notifyUsers({
      userIds: [post.created_by],
      workspaceId: post.workspace_id,
      brandId: post.brand_id,
      type: `post_${input.decision}_public`,
      title: titles[input.decision],
      body: input.comment,
      link: `/app/posts/${post.id}`,
      data: { postId: post.id, linkId: link.id },
      email: true,
    })
  }
  logger.info('approval_link_decision', { linkId: link.id, postId: input.postId, decision: input.decision })
  const view = await getPublicApproval(token)
  return view.posts.find((p) => p.id === input.postId)!
}

export async function commentViaLink(
  token: string,
  input: { postId: string; body: string; name: string | null },
): Promise<PublicPostView> {
  const link = await loadLink(token)
  if (!link.post_ids.includes(input.postId)) throw new ApiError('NOT_FOUND', 'Objava nije na ovom linku.')
  const admin = createSupabaseAdminClient()
  const { data: post } = await admin
    .from('posts')
    .select('brand_id, created_by, workspace_id')
    .eq('id', input.postId)
    .single()
  if (!post) throw new ApiError('NOT_FOUND', 'Objava ne postoji.')
  const { error } = await admin.from('post_comments').insert({
    post_id: input.postId,
    brand_id: post.brand_id,
    approval_link_id: link.id,
    author_name: input.name?.trim() || link.client_label || 'Klijent',
    body: input.body.trim(),
  })
  if (error) throw mapDbError(error)
  if (post.created_by) {
    await notifyUsers({
      userIds: [post.created_by],
      workspaceId: post.workspace_id,
      brandId: post.brand_id,
      type: 'post_comment_public',
      title: 'Nov komentar klijenta',
      body: input.body.slice(0, 200),
      link: `/app/posts/${input.postId}`,
      data: { postId: input.postId },
    })
  }
  const view = await getPublicApproval(token)
  return view.posts.find((p) => p.id === input.postId)!
}
