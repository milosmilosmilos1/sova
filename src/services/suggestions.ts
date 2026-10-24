import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import { createPost } from '@/services/posts/posts'
import type { Database, Json } from '@/types/database'

/**
 * Inbox predloga (brif 9.3): blog, promene sajta, praznici, analitika i AI uvidi slivaju se u
 * `suggestions`; korisnik prihvata (nastaje nacrt ili ga vodimo na pravu stranu), menja ili odbacuje.
 */
type SuggestionRow = Database['public']['Tables']['suggestions']['Row']
export type SuggestionStatus = SuggestionRow['status']

export interface SuggestionView {
  id: string
  brandId: string
  source: SuggestionRow['source']
  kind: string
  title: string
  body: string | null
  payload: Record<string, Json>
  evidence: Record<string, Json> | null
  score: number | null
  status: SuggestionStatus
  expiresAt: string | null
  acceptedPostId: string | null
  decidedAt: string | null
  createdAt: string
}

export const SOURCE_LABEL: Record<SuggestionRow['source'], string> = {
  blog: 'Blog',
  site_change: 'Promena sajta',
  holiday: 'Praznik',
  analytics: 'Analitika',
  insight: 'AI uvid',
  evergreen: 'Evergreen',
  manual: 'Ručno',
}

function toView(r: SuggestionRow): SuggestionView {
  return {
    id: r.id,
    brandId: r.brand_id,
    source: r.source,
    kind: r.kind,
    title: r.title,
    body: r.body,
    payload: (r.payload as Record<string, Json>) ?? {},
    evidence: (r.evidence as Record<string, Json> | null) ?? null,
    score: r.score === null ? null : Number(r.score),
    status: r.status,
    expiresAt: r.expires_at,
    acceptedPostId: r.accepted_post_id,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  }
}

export async function listSuggestions(
  viewer: Viewer,
  brandId: string,
  status: SuggestionStatus | 'all',
  limit = 50,
): Promise<{ items: SuggestionView[]; counts: Record<SuggestionStatus, number> }> {
  await getBrand(viewer, brandId)
  let q = viewer.supabase
    .from('suggestions')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  if (status !== 'all') q = q.eq('status', status)
  if (status === 'new') q = q.order('score', { ascending: false, nullsFirst: false })
  const { data, error } = await q
  if (error) throw mapDbError(error)
  const counts: Record<SuggestionStatus, number> = { new: 0, accepted: 0, dismissed: 0, expired: 0 }
  for (const s of ['new', 'accepted', 'dismissed', 'expired'] as SuggestionStatus[]) {
    const { count } = await viewer.supabase
      .from('suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('status', s)
    counts[s] = count ?? 0
  }
  return { items: (data ?? []).map(toView), counts }
}

async function loadForEdit(viewer: Viewer, id: string): Promise<SuggestionRow> {
  const row = unwrap(
    await viewer.supabase.from('suggestions').select('*').eq('id', id).maybeSingle(),
    'Predlog ne postoji ili nemate pristup.',
  )
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (row.status !== 'new') throw new ApiError('CONFLICT', 'Predlog je već obrađen.')
  return row
}

export interface AcceptResult {
  suggestion: SuggestionView
  postId: string | null
  /** kuda korisnika voditi posle prihvatanja */
  redirect: string
}

function draftFor(row: SuggestionRow): { title: string; text: string; linkUrl?: string } {
  const p = (row.payload as Record<string, Json>) ?? {}
  const url = typeof p.url === 'string' ? p.url : undefined
  if (row.kind === 'new_blog_post') {
    const t = typeof p.title === 'string' && p.title ? p.title : row.title
    return { title: t.slice(0, 200), text: `${t}\n\n${row.body ?? ''}`.trim(), linkUrl: url }
  }
  if (row.kind === 'repeat_format' && typeof p.text === 'string' && p.text) {
    return { title: row.title.slice(0, 200), text: `Nova objava u formatu koji je radio:\n\n${p.text}` }
  }
  return { title: row.title.slice(0, 200), text: [row.title, row.body].filter(Boolean).join('\n\n') }
}

export async function acceptSuggestion(
  viewer: Viewer,
  id: string,
  edits: { title?: string; text?: string },
): Promise<AcceptResult> {
  const row = await loadForEdit(viewer, id)
  let postId: string | null = null
  let redirect = '/app/inbox'
  if (row.kind === 'profile_update') redirect = '/app/brand'
  else if (row.kind === 'strategy_proposal' || row.kind === 'strategy_tweak') redirect = '/app/strategy'
  else {
    const draft = draftFor(row)
    const post = await createPost(viewer, {
      brandId: row.brand_id,
      title: edits.title ?? draft.title,
      masterText: edits.text ?? draft.text,
      linkUrl: draft.linkUrl,
      targets: [],
      media: [],
      source: 'suggestion',
    })
    postId = post.id
    redirect = `/app/posts/${post.id}`
    const admin = createSupabaseAdminClient()
    await admin.from('posts').update({ suggestion_id: row.id }).eq('id', post.id)
  }
  const { data, error } = await viewer.supabase
    .from('suggestions')
    .update({
      status: 'accepted',
      accepted_post_id: postId,
      decided_by: viewer.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'new')
    .select('*')
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('CONFLICT', 'Predlog je u međuvremenu obrađen.')
  logger.info('suggestion_accepted', { id, kind: row.kind, postId, by: viewer.user.id })
  return { suggestion: toView(data), postId, redirect }
}

export async function dismissSuggestion(viewer: Viewer, id: string): Promise<SuggestionView> {
  await loadForEdit(viewer, id)
  const { data, error } = await viewer.supabase
    .from('suggestions')
    .update({ status: 'dismissed', decided_by: viewer.user.id, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'new')
    .select('*')
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('CONFLICT', 'Predlog je u međuvremenu obrađen.')
  return toView(data)
}

export async function countNewSuggestions(viewer: Viewer, brandId: string): Promise<number> {
  const { count } = await viewer.supabase
    .from('suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('status', 'new')
  return count ?? 0
}
