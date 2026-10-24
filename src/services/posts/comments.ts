import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { notifyUsers } from '@/services/notifications'
import { loadPost } from '@/services/posts/posts'

export interface CommentView {
  id: string
  postId: string
  authorId: string | null
  authorName: string
  body: string
  mentions: string[]
  viaLink: boolean
  createdAt: string
}

export async function listComments(viewer: Viewer, postId: string): Promise<CommentView[]> {
  const post = await loadPost(viewer, postId)
  await requireMembership(viewer, post.workspace_id)
  const rows = unwrap(
    await viewer.supabase
      .from('post_comments')
      .select('id, post_id, author_id, author_name, body, mentions, approval_link_id, created_at')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  )
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((x): x is string => Boolean(x)))]
  const names = new Map<string, string>()
  if (authorIds.length) {
    const { data } = await viewer.supabase.from('profiles').select('id, full_name, email').in('id', authorIds)
    for (const p of data ?? []) names.set(p.id, p.full_name ?? p.email)
  }
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    authorId: r.author_id,
    authorName: r.author_name ?? (r.author_id ? (names.get(r.author_id) ?? 'Član tima') : 'Klijent'),
    body: r.body,
    mentions: r.mentions,
    viaLink: Boolean(r.approval_link_id),
    createdAt: r.created_at,
  }))
}

export async function addComment(
  viewer: Viewer,
  postId: string,
  body: string,
  mentions: string[] = [],
): Promise<CommentView> {
  const post = await loadPost(viewer, postId)
  await requireMembership(viewer, post.workspace_id)
  const { error } = await viewer.supabase
    .from('post_comments')
    .insert({ post_id: postId, brand_id: post.brand_id, author_id: viewer.user.id, body, mentions })
  if (error) throw mapDbError(error)
  const recipients = new Set(mentions)
  if (post.created_by && post.created_by !== viewer.user.id) recipients.add(post.created_by)
  if (recipients.size) {
    await notifyUsers({
      userIds: [...recipients],
      workspaceId: post.workspace_id,
      brandId: post.brand_id,
      type: 'post_comment',
      title: 'Nov komentar na objavi',
      body: body.slice(0, 200),
      link: `/app/posts/${postId}`,
      data: { postId },
    })
  }
  const all = await listComments(viewer, postId)
  const last = all[all.length - 1]
  if (!last) throw new ApiError('INTERNAL', 'Komentar nije sačuvan.')
  return last
}
