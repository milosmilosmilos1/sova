import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import type { IdeaStatus } from '@/lib/schemas/ideas'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import type { Database } from '@/types/database'

/**
 * Tabla predloga (D-115): ideje vide i za njih glasaju svi korisnici (bez imena autora), a prijavu
 * problema vide samo autor i administratori platforme, koji menjaju i status.
 */
type Row = Database['public']['Tables']['feature_requests']['Row']

export interface IdeaView {
  id: string
  kind: 'idea' | 'bug'
  title: string
  body: string
  status: IdeaStatus
  votes: number
  voted: boolean
  mine: boolean
  createdAt: string
}

const isAdmin = (viewer: Viewer) => viewer.profile.platformRole === 'platform_admin'

function toView(row: Row, viewer: Viewer, voted: Set<string>): IdeaView {
  return {
    id: row.id,
    kind: row.kind as IdeaView['kind'],
    title: row.title,
    body: row.body,
    status: row.status as IdeaStatus,
    votes: row.votes,
    voted: voted.has(row.id),
    mine: row.author_id === viewer.user.id,
    createdAt: row.created_at,
  }
}

export async function listIdeas(
  viewer: Viewer,
  input: { q?: string; sort: 'new' | 'top' },
): Promise<IdeaView[]> {
  const admin = createSupabaseAdminClient()
  let query = admin.from('feature_requests').select('*')
  // isto što RLS dozvoljava (ideje i sopstvene prijave), a administrator vidi i sve prijave problema
  if (!isAdmin(viewer)) query = query.or(`kind.eq.idea,author_id.eq.${viewer.user.id}`)
  if (input.q) {
    // znaci koji bi promenili PostgREST filter (zarez, zagrade, navodnik) ili LIKE šablon ne idu u upit
    const term = input.q.replace(/[%_,()"\\]/g, ' ').trim()
    if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`)
  }
  query =
    input.sort === 'top'
      ? query.order('votes', { ascending: false }).order('created_at', { ascending: false })
      : query.order('created_at', { ascending: false })
  const { data, error } = await query.limit(100)
  if (error) throw mapDbError(error)
  const ids = (data ?? []).map((r) => r.id)
  const voted = new Set<string>()
  if (ids.length) {
    const { data: votes } = await admin
      .from('feature_votes')
      .select('request_id')
      .eq('user_id', viewer.user.id)
      .eq('active', true)
      .in('request_id', ids)
    for (const v of votes ?? []) voted.add(v.request_id)
  }
  return (data ?? []).map((r) => toView(r, viewer, voted))
}

export async function createIdea(
  viewer: Viewer,
  input: { kind: 'idea' | 'bug'; title: string; body: string },
): Promise<IdeaView> {
  const { data, error } = await createSupabaseAdminClient()
    .from('feature_requests')
    .insert({ kind: input.kind, title: input.title, body: input.body, author_id: viewer.user.id })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  return toView(data, viewer, new Set())
}

export async function toggleIdeaVote(
  viewer: Viewer,
  ideaId: string,
): Promise<{ voted: boolean; votes: number }> {
  const { data, error } = await createSupabaseAdminClient().rpc('toggle_feature_vote', {
    p_request_id: ideaId,
    p_user_id: viewer.user.id,
  })
  if (error?.code === 'P0002') throw new ApiError('NOT_FOUND', 'Predlog ne postoji.')
  if (error) throw mapDbError(error)
  return data as { voted: boolean; votes: number }
}

export async function setIdeaStatus(viewer: Viewer, ideaId: string, status: IdeaStatus): Promise<IdeaView> {
  if (!isAdmin(viewer)) throw new ApiError('FORBIDDEN', 'Status menja administrator platforme.')
  const { data, error } = await createSupabaseAdminClient()
    .from('feature_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ideaId)
    .select('*')
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('NOT_FOUND', 'Predlog ne postoji.')
  return toView(data, viewer, new Set())
}
