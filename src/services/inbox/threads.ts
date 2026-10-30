import 'server-only'

import { replyGbpReview } from '@/integrations/social/google-business/reviews'
import { isProviderError, providerToApiError } from '@/integrations/social/errors'
import { MetaInbox } from '@/integrations/social/meta/inbox'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildInboxReplyPrompt,
  buildInboxReplySystemPrompt,
  inboxReplyJsonSchema,
  inboxReplyOutputSchema,
} from '@/lib/ai/prompts/inbox-reply'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { INBOX_FLAG, isFeatureEnabledFor } from '@/lib/flags'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { getBrand } from '@/services/brands'
import { loadAccountRow, type SocialAccountRow } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'
import type { Database, Json } from '@/types/database'

import { runAutomations, runFollowUps } from './automations'
import { canRead, canSend, INBOX_PLATFORMS, syncAccount, type InboxKind } from './sync'

/**
 * Inbox (D-117): razgovori po vrsti (poruke, komentari, recenzije), čitanje, odgovor kroz mrežu,
 * status (otvoreno, rešeno) i predlog odgovora od Sove (1 token). Slanje i ručna sinhronizacija
 * rade samo kad je prekidač `inbox` uključen za radni prostor.
 */
type ThreadRow = Database['public']['Tables']['inbox_threads']['Row']

export interface ThreadView {
  id: string
  kind: InboxKind
  platform: string
  accountId: string
  accountName: string | null
  authorName: string | null
  authorHandle: string | null
  preview: string
  lastMessageAt: string
  unread: boolean
  status: 'open' | 'done'
  rating: number | null
  postPermalink: string | null
  postExcerpt: string | null
}

export interface MessageView {
  id: string
  direction: 'in' | 'out'
  authorName: string | null
  body: string
  sentAt: string
  source: string
}

export interface InboxAccountView {
  id: string
  platform: string
  name: string
  read: InboxKind[]
  send: InboxKind[]
}

export interface InboxView {
  enabled: boolean
  threads: ThreadView[]
  counts: Record<InboxKind, { total: number; unread: number }>
  accounts: InboxAccountView[]
  replyPrice: number
}

const KINDS: InboxKind[] = ['message', 'comment', 'review']

function toThread(row: ThreadRow, names: Map<string, string>): ThreadView {
  return {
    id: row.id,
    kind: row.kind as InboxKind,
    platform: row.platform,
    accountId: row.social_account_id,
    accountName: names.get(row.social_account_id) ?? null,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    preview: row.preview,
    lastMessageAt: row.last_message_at,
    unread: row.unread,
    status: row.status as ThreadView['status'],
    rating: row.rating,
    postPermalink: row.post_permalink,
    postExcerpt: row.post_excerpt,
  }
}

async function inboxAccounts(brandId: string): Promise<SocialAccountRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('*')
    .eq('brand_id', brandId)
    .in('platform', [...INBOX_PLATFORMS])
    .eq('status', 'active')
  if (error) throw mapDbError(error)
  return data ?? []
}

export async function getInbox(
  viewer: Viewer,
  query: { brandId: string; kind: InboxKind; platform?: string; status: 'open' | 'done' | 'all' },
): Promise<InboxView> {
  const brand = await getBrand(viewer, query.brandId)
  const admin = createSupabaseAdminClient()
  let list = admin
    .from('inbox_threads')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('kind', query.kind)
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (query.platform) list = list.eq('platform', query.platform as ThreadRow['platform'])
  if (query.status !== 'all') list = list.eq('status', query.status)
  const [enabled, accounts, { data: rows, error }, { data: all }, replyPrice] = await Promise.all([
    isFeatureEnabledFor(INBOX_FLAG, brand.workspace_id),
    inboxAccounts(brand.id),
    list,
    admin.from('inbox_threads').select('kind, unread').eq('brand_id', brand.id).limit(5000),
    getTokenPrice('inbox_reply'),
  ])
  if (error) throw mapDbError(error)
  const counts = Object.fromEntries(KINDS.map((k) => [k, { total: 0, unread: 0 }])) as InboxView['counts']
  for (const t of all ?? []) {
    const c = counts[t.kind as InboxKind]
    if (!c) continue
    c.total++
    if (t.unread) c.unread++
  }
  const names = new Map(accounts.map((a) => [a.id, a.name]))
  return {
    enabled,
    threads: (rows ?? []).map((r) => toThread(r, names)),
    counts,
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      name: a.name,
      read: KINDS.filter((k) => canRead(a, k)),
      send: KINDS.filter((k) => canSend(a, k)),
    })),
    replyPrice,
  }
}

async function loadThread(viewer: Viewer, id: string): Promise<ThreadRow> {
  const { data, error } = await viewer.supabase.from('inbox_threads').select('*').eq('id', id).maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('NOT_FOUND', 'Razgovor ne postoji.')
  return data
}

export async function getThread(
  viewer: Viewer,
  id: string,
): Promise<{ thread: ThreadView; messages: MessageView[]; canReply: boolean }> {
  const row = await loadThread(viewer, id)
  const admin = createSupabaseAdminClient()
  const [{ data: messages, error }, account] = await Promise.all([
    admin.from('inbox_messages').select('*').eq('thread_id', row.id).order('sent_at').limit(200),
    loadAccountRow(row.social_account_id),
  ])
  if (error) throw mapDbError(error)
  if (row.unread) await admin.from('inbox_threads').update({ unread: false }).eq('id', row.id)
  return {
    thread: { ...toThread(row, new Map(account ? [[account.id, account.name]] : [])), unread: false },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      direction: m.direction as MessageView['direction'],
      authorName: m.author_name,
      body: m.body,
      sentAt: m.sent_at,
      source: m.source,
    })),
    canReply: Boolean(account && account.status === 'active' && canSend(account, row.kind as InboxKind)),
  }
}

async function assertEnabled(workspaceId: string): Promise<void> {
  if (!(await isFeatureEnabledFor(INBOX_FLAG, workspaceId)))
    throw new ApiError('FORBIDDEN', 'Inbox se uključuje kad Meta odobri dozvole za poruke i komentare.')
}

/** Greška mreže pri slanju; Instagram i Messenger primaju poruku samo 24 h posle poslednje poruke osobe. */
function sendError(error: unknown): ApiError {
  if (isProviderError(error)) {
    const raw = error.raw as { error_subcode?: number; message?: string } | null
    if (raw?.error_subcode === 2534022 || /outside of allowed window/i.test(raw?.message ?? ''))
      return new ApiError(
        'VALIDATION',
        'Mreža prima odgovor samo 24 sata posle poslednje poruke osobe. Odgovorite kad ponovo piše.',
      )
  }
  return providerToApiError(error)
}

export async function replyToThread(viewer: Viewer, id: string, text: string): Promise<MessageView> {
  const row = await loadThread(viewer, id)
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  await assertEnabled(row.workspace_id)
  const account = await loadAccountRow(row.social_account_id)
  if (!account || account.status !== 'active')
    throw new ApiError('VALIDATION', 'Nalog nije aktivan. Povežite ga ponovo u Mrežama.')
  const kind = row.kind as InboxKind
  if (!canSend(account, kind))
    throw new ApiError(
      'VALIDATION',
      'Nalog nema dozvolu za odgovor. Povežite ga ponovo i odobrite Sovi odgovaranje.',
    )
  let externalId: string | null
  try {
    const token = await accessTokenFor(account)
    if (account.platform === 'google_business') {
      if (!account.external_parent_id) throw new ApiError('VALIDATION', 'Lokacija nema nalog.')
      externalId = await replyGbpReview(
        token,
        account.external_parent_id,
        account.external_id,
        row.external_id,
        text,
      )
    } else {
      const meta = new MetaInbox(token)
      if (kind === 'message') {
        const pageId = account.platform === 'instagram' ? account.external_parent_id : account.external_id
        if (!pageId || !row.author_external_id) throw new ApiError('VALIDATION', 'Razgovor nema primaoca.')
        externalId = await meta.sendMessage(pageId, { id: row.author_external_id }, text)
      } else {
        externalId = await meta.replyToComment(
          account.platform === 'instagram' ? 'instagram' : 'facebook',
          row.external_id,
          text,
        )
      }
    }
  } catch (error) {
    throw error instanceof ApiError ? error : sendError(error)
  }
  const admin = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('inbox_messages')
    .insert({
      thread_id: row.id,
      brand_id: row.brand_id,
      external_id: externalId,
      direction: 'out',
      body: text,
      sent_at: now,
      source: 'reply',
      sent_by: viewer.user.id,
      author_name: account.name,
    })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  await admin
    .from('inbox_threads')
    .update({
      preview: text.replace(/\s+/g, ' ').slice(0, 300),
      last_message_at: now,
      unread: false,
      updated_at: now,
    })
    .eq('id', row.id)
  return {
    id: data.id,
    direction: 'out',
    authorName: data.author_name,
    body: data.body,
    sentAt: data.sent_at,
    source: data.source,
  }
}

export async function setThreadStatus(
  viewer: Viewer,
  id: string,
  status: 'open' | 'done',
): Promise<ThreadView> {
  const row = await loadThread(viewer, id)
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  const { data, error } = await createSupabaseAdminClient()
    .from('inbox_threads')
    .update({ status, unread: false, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  return toThread(data, new Map())
}

/** Predlog odgovora: 1 token, glas brenda i poslednjih 12 poruka razgovora. */
export async function suggestThreadReply(
  viewer: Viewer,
  id: string,
  meta: { requestId: string },
): Promise<{ reply: string; tokensCharged: number }> {
  const row = await loadThread(viewer, id)
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertEnabled(row.workspace_id)
  await assertDailyQuota(row.workspace_id)
  const brand = await getBrand(viewer, row.brand_id)
  const { data: messages } = await createSupabaseAdminClient()
    .from('inbox_messages')
    .select('direction, author_name, body, sent_at')
    .eq('thread_id', row.id)
    .order('sent_at', { ascending: false })
    .limit(12)
  const ordered = (messages ?? []).reverse()
  const lastIn = [...ordered].reverse().find((m) => m.direction === 'in')
  const context = await buildBrandContext(brand, (lastIn?.body ?? row.preview).slice(0, 500))
  const price = await getTokenPrice('inbox_reply')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    userId: viewer.user.id,
    type: 'inbox_reply',
    tokens: price,
    input: { threadId: row.id, kind: row.kind, platform: row.platform },
    requestId: meta.requestId,
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildInboxReplySystemPrompt(),
          prompt: buildInboxReplyPrompt({
            brand: context,
            kind: row.kind as InboxKind,
            platform: row.platform,
            rating: row.rating,
            postExcerpt: row.post_excerpt,
            messages: ordered.map((m) => ({
              direction: m.direction as 'in' | 'out',
              author: m.author_name,
              body: m.body,
            })),
          }),
          jsonSchema: inboxReplyJsonSchema(),
          maxOutputTokens: 1024,
          temperature: 0.6,
          thinking: 'low',
        }),
      { label: 'inbox-reply' },
    )
    const parsed = inboxReplyOutputSchema.safeParse(outcome.result.json)
    if (!parsed.success || !parsed.data.reply.trim())
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    const reply = parsed.data.reply
      .trim()
      .replace(/^["„“]+|["”“]+$/g, '')
      .slice(0, 2000)
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: { reply } as unknown as Json,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { reply, tokensCharged: price }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/** „Osveži Inbox”: nalozi brenda odmah, zajedno sa DM automatizacijom i podsetnicima. */
export async function syncBrandInbox(
  viewer: Viewer,
  brandId: string,
): Promise<{ threads: number; inserted: number; dms: number; errors: string[] }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  await assertEnabled(brand.workspace_id)
  const out = { threads: 0, inserted: 0, dms: 0, errors: [] as string[] }
  for (const account of await inboxAccounts(brand.id)) {
    const result = await syncAccountAndAutomate(account)
    out.threads += result.threads
    out.inserted += result.inserted
    out.dms += result.dms
    out.errors.push(...result.errors.map((e) => `${account.name}: ${e}`))
  }
  return out
}

/** Jedan nalog: sinhronizacija, pa DM automatizacija za nove komentare i podsetnici. */
export async function syncAccountAndAutomate(
  account: SocialAccountRow,
  fetchImpl?: typeof fetch,
): Promise<{ threads: number; inserted: number; dms: number; errors: string[] }> {
  try {
    const result = await syncAccount(account, fetchImpl)
    const dms =
      (await runAutomations(account, result.newComments, fetchImpl)) +
      (await runFollowUps(account, fetchImpl))
    return { threads: result.threads, inserted: result.inserted, dms, errors: result.errors }
  } catch (error) {
    return {
      threads: 0,
      inserted: 0,
      dms: 0,
      errors: [error instanceof Error ? error.message : 'Sinhronizacija nije uspela.'],
    }
  }
}
