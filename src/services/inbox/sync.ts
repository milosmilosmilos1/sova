import 'server-only'

import { listGbpReviews } from '@/integrations/social/google-business/reviews'
import {
  MetaInbox,
  type InboxComment,
  type InboxConversation,
  type InboxEntry,
  type InboxReview,
} from '@/integrations/social/meta/inbox'
import { isFeatureEnabled, INBOX_FLAG, rolloutWorkspaces } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import type { SocialAccountRow } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'

/**
 * Sinhronizacija Inbox-a (D-117): komentari, razgovori i recenzije sa mreže u `inbox_threads` i
 * `inbox_messages`. Razgovor se prepoznaje po nalogu, vrsti i ID-ju sa mreže, a poruka po ID-ju, pa
 * ponovljena sinhronizacija ne duplira ništa. Nova dolazna poruka otvara razgovor i označava ga kao
 * nepročitan. Novi komentari drugih ljudi se vraćaju za DM automatizaciju.
 */
export const INBOX_PLATFORMS = ['instagram', 'facebook', 'google_business'] as const
export type InboxKind = 'message' | 'comment' | 'review'

/** Dozvola koju nalog mora da ima za svaku vrstu (scope sa mreže); bez nje se vrsta preskače. */
export const INBOX_SCOPES: Record<string, Partial<Record<InboxKind, string>>> = {
  instagram: { comment: 'instagram_manage_comments', message: 'instagram_manage_messages' },
  facebook: {
    comment: 'pages_read_user_content',
    message: 'pages_messaging',
    review: 'pages_read_user_content',
  },
  google_business: { review: 'https://www.googleapis.com/auth/business.manage' },
}

/** Dozvola za slanje (odgovor na komentar i recenziju, poruka); bez nje Inbox samo čita. */
export const INBOX_SEND_SCOPES: Record<string, Partial<Record<InboxKind, string>>> = {
  instagram: { comment: 'instagram_manage_comments', message: 'instagram_manage_messages' },
  facebook: {
    comment: 'pages_manage_engagement',
    message: 'pages_messaging',
    review: 'pages_manage_engagement',
  },
  google_business: { review: 'https://www.googleapis.com/auth/business.manage' },
}

export function canRead(row: Pick<SocialAccountRow, 'platform' | 'scopes'>, kind: InboxKind): boolean {
  const scope = INBOX_SCOPES[row.platform]?.[kind]
  return Boolean(scope && row.scopes.includes(scope))
}

export function canSend(row: Pick<SocialAccountRow, 'platform' | 'scopes'>, kind: InboxKind): boolean {
  const scope = INBOX_SEND_SCOPES[row.platform]?.[kind]
  return Boolean(scope && row.scopes.includes(scope))
}

export interface NewComment {
  accountId: string
  platform: 'instagram' | 'facebook'
  commentId: string
  text: string
  authorId: string | null
  authorHandle: string | null
  postId: string | null
  createdAt: string
}

interface ThreadItem {
  kind: InboxKind
  externalId: string
  author: { id: string | null; name: string | null; handle: string | null }
  post: { id: string; permalink: string | null; excerpt: string | null } | null
  rating: number | null
  messages: Array<{
    externalId: string
    direction: 'in' | 'out'
    authorName: string | null
    body: string
    sentAt: string
  }>
}

export interface SyncResult {
  threads: number
  inserted: number
  newComments: NewComment[]
  errors: string[]
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

function selfCheck(row: SocialAccountRow): (e: InboxEntry) => boolean {
  const ids = new Set([row.external_id, row.external_parent_id].filter((x): x is string => Boolean(x)))
  const handle = row.username?.toLowerCase() ?? null
  return (e) =>
    Boolean((e.authorId && ids.has(e.authorId)) || (handle && e.authorHandle?.toLowerCase() === handle))
}

function commentItems(row: SocialAccountRow, comments: InboxComment[]): ThreadItem[] {
  const isSelf = selfCheck(row)
  return comments
    .filter((c) => !isSelf(c) && c.text.trim())
    .map((c) => ({
      kind: 'comment' as const,
      externalId: c.id,
      author: { id: c.authorId, name: c.authorName, handle: c.authorHandle },
      post: { id: c.postId, permalink: c.postPermalink, excerpt: c.postExcerpt },
      rating: null,
      messages: [c, ...c.replies]
        .filter((m) => m.text.trim())
        .map((m) => ({
          externalId: m.id,
          direction: (m === c ? 'in' : isSelf(m) ? 'out' : 'in') as 'in' | 'out',
          authorName: m.authorName,
          body: clip(m.text, 8000),
          sentAt: m.createdAt,
        })),
    }))
}

function conversationItems(conversations: InboxConversation[]): ThreadItem[] {
  return conversations
    .filter((c) => c.participant && c.messages.length)
    .map((c) => ({
      kind: 'message' as const,
      externalId: c.id,
      author: { id: c.participant!.id, name: c.participant!.name, handle: c.participant!.handle },
      post: null,
      rating: null,
      messages: c.messages
        .filter((m) => m.text.trim())
        .map((m) => ({
          externalId: m.id,
          direction: (m.outbound ? 'out' : 'in') as 'in' | 'out',
          authorName: m.authorName,
          body: clip(m.text, 8000),
          sentAt: m.createdAt,
        })),
    }))
}

function reviewItems(row: SocialAccountRow, reviews: InboxReview[]): ThreadItem[] {
  const isSelf = selfCheck(row)
  return reviews.map((r) => ({
    kind: 'review' as const,
    externalId: r.id,
    author: { id: r.authorId, name: r.authorName, handle: null },
    post: null,
    rating: r.rating,
    messages: [
      {
        externalId: r.id,
        direction: 'in' as const,
        authorName: r.authorName,
        body: clip(r.text || '★'.repeat(r.rating ?? 0) || '…', 8000),
        sentAt: r.createdAt,
      },
      ...r.replies
        .filter((m) => m.text.trim())
        .map((m) => ({
          externalId: m.id,
          direction: (row.platform === 'google_business' || isSelf(m) ? 'out' : 'in') as 'in' | 'out',
          authorName: m.authorName,
          body: clip(m.text, 8000),
          sentAt: m.createdAt,
        })),
    ],
  }))
}

/** Upis razgovora i poruka; vraća broj novih poruka i nove dolazne komentare. */
async function store(row: SocialAccountRow, items: ThreadItem[]): Promise<Omit<SyncResult, 'errors'>> {
  const admin = createSupabaseAdminClient()
  const usable = items.filter((i) => i.messages.length)
  if (!usable.length) return { threads: 0, inserted: 0, newComments: [] }
  const now = new Date().toISOString()
  const threadRows = usable.map((i) => {
    const sorted = [...i.messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    const last = sorted[sorted.length - 1]!
    const lastIn = [...sorted].reverse().find((m) => m.direction === 'in')
    return {
      workspace_id: row.workspace_id,
      brand_id: row.brand_id,
      social_account_id: row.id,
      platform: row.platform,
      kind: i.kind,
      external_id: i.externalId,
      author_external_id: i.author.id,
      author_name: i.author.name,
      author_handle: i.author.handle,
      post_external_id: i.post?.id ?? null,
      post_permalink: i.post?.permalink ?? null,
      post_excerpt: i.post?.excerpt ?? null,
      rating: i.rating,
      preview: clip(last.body.replace(/\s+/g, ' '), 300),
      last_message_at: last.sentAt,
      last_inbound_at: lastIn?.sentAt ?? null,
      updated_at: now,
    }
  })
  const { data: threads, error } = await admin
    .from('inbox_threads')
    .upsert(threadRows, { onConflict: 'social_account_id,kind,external_id' })
    .select('id, kind, external_id')
  if (error) throw mapDbError(error)
  const idOf = new Map((threads ?? []).map((t) => [`${t.kind}:${t.external_id}`, t.id]))

  const messageRows = usable.flatMap((i) => {
    const threadId = idOf.get(`${i.kind}:${i.externalId}`)
    return threadId
      ? i.messages.map((m) => ({
          thread_id: threadId,
          brand_id: row.brand_id,
          external_id: m.externalId,
          direction: m.direction,
          author_name: m.authorName,
          body: m.body,
          sent_at: m.sentAt,
          source: 'sync',
        }))
      : []
  })
  const inserted: Array<{ thread_id: string; external_id: string | null; direction: string }> = []
  for (let i = 0; i < messageRows.length; i += 500) {
    const { data, error: msgError } = await admin
      .from('inbox_messages')
      .upsert(messageRows.slice(i, i + 500), { onConflict: 'thread_id,external_id', ignoreDuplicates: true })
      .select('thread_id, external_id, direction')
    if (msgError) throw mapDbError(msgError)
    inserted.push(...(data ?? []))
  }

  // nova dolazna poruka: razgovor je opet otvoren i nepročitan
  const reopened = [...new Set(inserted.filter((m) => m.direction === 'in').map((m) => m.thread_id))]
  if (reopened.length)
    await admin.from('inbox_threads').update({ unread: true, status: 'open' }).in('id', reopened)

  const newIn = new Set(inserted.filter((m) => m.direction === 'in').map((m) => m.external_id))
  const newComments: NewComment[] = []
  if (row.platform === 'instagram' || row.platform === 'facebook')
    for (const i of usable)
      if (i.kind === 'comment')
        for (const m of i.messages)
          if (m.direction === 'in' && newIn.has(m.externalId))
            newComments.push({
              accountId: row.id,
              platform: row.platform,
              commentId: m.externalId,
              text: m.body,
              authorId: m.externalId === i.externalId ? i.author.id : null,
              authorHandle: m.externalId === i.externalId ? i.author.handle : null,
              postId: i.post?.id ?? null,
              createdAt: m.sentAt,
            })
  return { threads: threadRows.length, inserted: inserted.length, newComments }
}

/** Jedan nalog: sve vrste za koje ima dozvolu; greška jedne vrste ne zaustavlja ostale. */
export async function syncAccount(row: SocialAccountRow, fetchImpl?: typeof fetch): Promise<SyncResult> {
  const result: SyncResult = { threads: 0, inserted: 0, newComments: [], errors: [] }
  if (row.status !== 'active') return result
  const token = await accessTokenFor(row)
  const meta = new MetaInbox(token, { fetchImpl })
  const jobs: Array<{ kind: InboxKind; load: () => Promise<ThreadItem[]> }> = []
  if (row.platform === 'instagram') {
    if (canRead(row, 'comment'))
      jobs.push({
        kind: 'comment',
        load: async () => commentItems(row, await meta.instagramComments(row.external_id)),
      })
    if (canRead(row, 'message') && row.external_parent_id)
      jobs.push({
        kind: 'message',
        load: async () =>
          conversationItems(await meta.conversations(row.external_parent_id!, 'instagram', row.external_id)),
      })
  } else if (row.platform === 'facebook') {
    if (canRead(row, 'comment'))
      jobs.push({
        kind: 'comment',
        load: async () => commentItems(row, await meta.facebookComments(row.external_id)),
      })
    if (canRead(row, 'review'))
      jobs.push({
        kind: 'review',
        load: async () => reviewItems(row, await meta.pageRatings(row.external_id)),
      })
    if (canRead(row, 'message'))
      jobs.push({
        kind: 'message',
        load: async () =>
          conversationItems(await meta.conversations(row.external_id, 'messenger', row.external_id)),
      })
  } else if (row.platform === 'google_business' && canRead(row, 'review') && row.external_parent_id) {
    jobs.push({
      kind: 'review',
      load: async () =>
        reviewItems(row, await listGbpReviews(token, row.external_parent_id!, row.external_id, fetchImpl)),
    })
  }
  for (const job of jobs) {
    try {
      const out = await store(row, await job.load())
      result.threads += out.threads
      result.inserted += out.inserted
      result.newComments.push(...out.newComments)
    } catch (error) {
      logger.warn('inbox_sync_failed', { accountId: row.id, kind: job.kind, error })
      result.errors.push(`${job.kind}: ${error instanceof Error ? error.message : 'greška'}`)
    }
  }
  return result
}

/** Nalozi za pozadinsku sinhronizaciju: svi kad je prekidač uključen, inače samo prostori iz rollout-a. */
export async function inboxAccountsToSync(): Promise<string[]> {
  const admin = createSupabaseAdminClient()
  let query = admin
    .from('social_accounts')
    .select('id')
    .in('platform', [...INBOX_PLATFORMS])
    .eq('status', 'active')
  if (!(await isFeatureEnabled(INBOX_FLAG))) {
    const workspaces = await rolloutWorkspaces(INBOX_FLAG)
    if (!workspaces.length) return []
    query = query.in('workspace_id', workspaces)
  }
  const { data, error } = await query.limit(500)
  if (error) throw mapDbError(error)
  return (data ?? []).map((r) => r.id)
}
