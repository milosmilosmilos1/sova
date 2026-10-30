import 'server-only'

import { randomBytes } from 'node:crypto'

import { MetaInbox } from '@/integrations/social/meta/inbox'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { env } from '@/lib/env'
import { INBOX_FLAG, isFeatureEnabledFor } from '@/lib/flags'
import { cleanKeyword, matchesKeyword } from '@/lib/inbox/keywords'
import { logger } from '@/lib/logger'
import type { AutomationInput } from '@/lib/schemas/inbox'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import { loadAccountRow, type SocialAccountRow } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'
import type { Database } from '@/types/database'

import { canSend, type NewComment } from './sync'

/**
 * DM automatizacija (D-117): kad neko na Instagramu ili Facebook-u komentariše ključnu reč, Sova
 * javno odgovori na komentar (jedna od do tri varijante), pošalje privatnu poruku sa linkom koji
 * broji klik (`/r/{token}`) i, ako osoba odgovori a ne klikne, posle zadatog broja sati pošalje
 * podsetnik. Jedna osoba dobija poruku od jednog toka najviše jednom. Tok se uključuje samo kad je
 * prekidač `inbox` uključen za radni prostor i nalog ima dozvolu za poruke.
 */
type AutomationRow = Database['public']['Tables']['dm_automations']['Row']
type ContactRow = Database['public']['Tables']['dm_contacts']['Row']

/** Meta: privatni odgovor do 7 dana posle komentara, poruka u razgovoru do 24 h posle poslednje poruke osobe. */
const PRIVATE_REPLY_DAYS = 7
const MESSAGING_WINDOW_MS = 24 * 3_600_000
const MAX_DMS_PER_RUN = 20

export interface AutomationView {
  id: string
  name: string
  accountId: string
  accountName: string | null
  platform: string
  keywords: string[]
  publicReplies: string[]
  dmMessage: string
  linkUrl: string | null
  linkLabel: string | null
  followUp: string | null
  followUpHours: number
  active: boolean
  lastError: string | null
  stats: { matches: number; dms: number; clicks: number }
  createdAt: string
}

export interface ContactView {
  id: string
  automationName: string
  username: string | null
  stage: string
  commentText: string | null
  createdAt: string
}

export interface AutomationsView {
  enabled: boolean
  automations: AutomationView[]
  contacts: ContactView[]
  totals: { matches: number; dms: number; clicks: number; active: number; paused: number; problems: number }
  accounts: Array<{ id: string; platform: string; name: string; canMessage: boolean }>
}

export function trackedLink(token: string): string {
  return `${(env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/r/${token}`
}

export function dmText(
  a: Pick<AutomationRow, 'dm_message' | 'link_url' | 'link_label'>,
  token: string,
): string {
  if (!a.link_url) return a.dm_message
  return `${a.dm_message}\n\n${a.link_label ? `${a.link_label}: ` : ''}${trackedLink(token)}`
}

async function messagingAccounts(brandId: string): Promise<SocialAccountRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('*')
    .eq('brand_id', brandId)
    .in('platform', ['instagram', 'facebook'])
    .neq('status', 'revoked')
  if (error) throw mapDbError(error)
  return data ?? []
}

export async function listAutomations(viewer: Viewer, brandId: string): Promise<AutomationsView> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const [enabled, accounts, { data: rows, error }, { data: contacts }] = await Promise.all([
    isFeatureEnabledFor(INBOX_FLAG, brand.workspace_id),
    messagingAccounts(brand.id),
    admin
      .from('dm_automations')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false }),
    admin
      .from('dm_contacts')
      .select('id, automation_id, username, stage, comment_text, created_at, dm_sent_at, clicked_at')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  if (error) throw mapDbError(error)
  const byAccount = new Map(accounts.map((a) => [a.id, a]))
  const names = new Map((rows ?? []).map((r) => [r.id, r.name]))
  const stats = new Map<string, { matches: number; dms: number; clicks: number }>()
  for (const c of contacts ?? []) {
    const s = stats.get(c.automation_id) ?? { matches: 0, dms: 0, clicks: 0 }
    s.matches++
    if (c.dm_sent_at) s.dms++
    if (c.clicked_at) s.clicks++
    stats.set(c.automation_id, s)
  }
  const automations = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    accountId: r.social_account_id,
    accountName: byAccount.get(r.social_account_id)?.name ?? null,
    platform: byAccount.get(r.social_account_id)?.platform ?? 'instagram',
    keywords: r.keywords,
    publicReplies: r.public_replies,
    dmMessage: r.dm_message,
    linkUrl: r.link_url,
    linkLabel: r.link_label,
    followUp: r.follow_up,
    followUpHours: r.follow_up_hours,
    active: r.active,
    lastError: r.last_error,
    stats: stats.get(r.id) ?? { matches: 0, dms: 0, clicks: 0 },
    createdAt: r.created_at,
  }))
  const totals = automations.reduce(
    (t, a) => ({
      matches: t.matches + a.stats.matches,
      dms: t.dms + a.stats.dms,
      clicks: t.clicks + a.stats.clicks,
      active: t.active + (a.active && !a.lastError ? 1 : 0),
      paused: t.paused + (a.active ? 0 : 1),
      problems: t.problems + (a.active && a.lastError ? 1 : 0),
    }),
    { matches: 0, dms: 0, clicks: 0, active: 0, paused: 0, problems: 0 },
  )
  return {
    enabled,
    automations,
    contacts: (contacts ?? []).slice(0, 50).map((c) => ({
      id: c.id,
      automationName: names.get(c.automation_id) ?? '',
      username: c.username,
      stage: c.stage,
      commentText: c.comment_text,
      createdAt: c.created_at,
    })),
    totals,
    accounts: accounts
      .filter((a) => a.status === 'active')
      .map((a) => ({ id: a.id, platform: a.platform, name: a.name, canMessage: canSend(a, 'message') })),
  }
}

async function loadAutomation(viewer: Viewer, id: string): Promise<AutomationRow> {
  const { data, error } = await viewer.supabase.from('dm_automations').select('*').eq('id', id).maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) throw new ApiError('NOT_FOUND', 'DM automatizacija ne postoji.')
  return data
}

/** Uključivanje traži prekidač za radni prostor i dozvolu za poruke na nalogu. */
async function assertCanActivate(workspaceId: string, account: SocialAccountRow): Promise<void> {
  if (!(await isFeatureEnabledFor(INBOX_FLAG, workspaceId)))
    throw new ApiError(
      'FORBIDDEN',
      'DM automatizacija se uključuje kad Meta odobri dozvole za poruke. Tok je sačuvan i čeka.',
    )
  if (account.status !== 'active') throw new ApiError('VALIDATION', 'Nalog nije aktivan. Povežite ga ponovo.')
  if (!canSend(account, 'message'))
    throw new ApiError(
      'VALIDATION',
      'Nalog nema dozvolu za poruke. Povežite ga ponovo i odobrite Sovi slanje poruka.',
    )
}

function rowFields(input: AutomationInput) {
  return {
    name: input.name.trim(),
    keywords: [...new Set(input.keywords.map(cleanKeyword).filter(Boolean))],
    public_replies: input.publicReplies.map((r) => r.trim()).filter(Boolean),
    dm_message: input.dmMessage.trim(),
    link_url: input.linkUrl ?? null,
    link_label: input.linkLabel?.trim() || null,
    follow_up: input.followUp?.trim() || null,
    follow_up_hours: input.followUpHours,
  }
}

export async function createAutomation(viewer: Viewer, input: AutomationInput): Promise<AutomationView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const account = await loadAccountRow(input.accountId)
  if (!account || account.brand_id !== brand.id || !['instagram', 'facebook'].includes(account.platform))
    throw new ApiError('VALIDATION', 'Izaberite Instagram ili Facebook nalog ovog brenda.')
  const fields = rowFields(input)
  if (!fields.keywords.length) throw new ApiError('VALIDATION', 'Dodajte bar jednu ključnu reč.')
  if (input.active) await assertCanActivate(brand.workspace_id, account)
  const { data, error } = await createSupabaseAdminClient()
    .from('dm_automations')
    .insert({
      ...fields,
      workspace_id: brand.workspace_id,
      brand_id: brand.id,
      social_account_id: account.id,
      active: input.active,
      created_by: viewer.user.id,
    })
    .select('id')
    .single()
  if (error) throw mapDbError(error)
  return (await listAutomations(viewer, brand.id)).automations.find((a) => a.id === data.id)!
}

export async function updateAutomation(
  viewer: Viewer,
  id: string,
  input: Partial<Omit<AutomationInput, 'brandId' | 'accountId'>>,
): Promise<AutomationView> {
  const row = await loadAutomation(viewer, id)
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  const patch: Database['public']['Tables']['dm_automations']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.keywords !== undefined) {
    patch.keywords = [...new Set(input.keywords.map(cleanKeyword).filter(Boolean))]
    if (!patch.keywords.length) throw new ApiError('VALIDATION', 'Dodajte bar jednu ključnu reč.')
  }
  if (input.publicReplies !== undefined)
    patch.public_replies = input.publicReplies.map((r) => r.trim()).filter(Boolean)
  if (input.dmMessage !== undefined) patch.dm_message = input.dmMessage.trim()
  if (input.linkUrl !== undefined) patch.link_url = input.linkUrl ?? null
  if (input.linkLabel !== undefined) patch.link_label = input.linkLabel?.trim() || null
  if (input.followUp !== undefined) patch.follow_up = input.followUp?.trim() || null
  if (input.followUpHours !== undefined) patch.follow_up_hours = input.followUpHours
  if (input.active !== undefined) {
    if (input.active && !row.active) {
      const account = await loadAccountRow(row.social_account_id)
      if (!account) throw new ApiError('VALIDATION', 'Nalog više nije povezan.')
      await assertCanActivate(row.workspace_id, account)
    }
    patch.active = input.active
    if (input.active) patch.last_error = null
  }
  const { error } = await createSupabaseAdminClient().from('dm_automations').update(patch).eq('id', id)
  if (error) throw mapDbError(error)
  return (await listAutomations(viewer, row.brand_id)).automations.find((a) => a.id === id)!
}

export async function deleteAutomation(viewer: Viewer, id: string): Promise<void> {
  const row = await loadAutomation(viewer, id)
  await requireMembership(viewer, row.workspace_id, EDIT_ROLES)
  const { error } = await createSupabaseAdminClient().from('dm_automations').delete().eq('id', id)
  if (error) throw mapDbError(error)
}

/** Privatni odgovor i javni odgovor za nove komentare sa ključnom reči. Vraća broj poslatih poruka. */
export async function runAutomations(
  account: SocialAccountRow,
  comments: NewComment[],
  fetchImpl?: typeof fetch,
): Promise<number> {
  if (!comments.length || account.status !== 'active' || !canSend(account, 'message')) return 0
  if (!(await isFeatureEnabledFor(INBOX_FLAG, account.workspace_id))) return 0
  const admin = createSupabaseAdminClient()
  const { data: automations } = await admin
    .from('dm_automations')
    .select('*')
    .eq('social_account_id', account.id)
    .eq('active', true)
    .order('created_at')
  if (!automations?.length) return 0
  const pageId = account.platform === 'instagram' ? account.external_parent_id : account.external_id
  if (!pageId) return 0
  const meta = new MetaInbox(await accessTokenFor(account), { fetchImpl })
  const oldest = Date.now() - PRIVATE_REPLY_DAYS * 86_400_000
  let sent = 0
  for (const comment of comments) {
    if (sent >= MAX_DMS_PER_RUN) break
    if (!comment.authorId || Date.parse(comment.createdAt) < oldest) continue
    // prvi tok čija ključna reč odgovara; tok vidi samo komentare nastale posle njega
    const automation = automations.find(
      (a) =>
        Date.parse(comment.createdAt) >= Date.parse(a.created_at) && matchesKeyword(comment.text, a.keywords),
    )
    if (!automation) continue
    const token = randomBytes(12).toString('base64url')
    const { data: contact } = await admin
      .from('dm_contacts')
      .upsert(
        {
          automation_id: automation.id,
          brand_id: account.brand_id,
          external_user_id: comment.authorId,
          username: comment.authorHandle,
          comment_external_id: comment.commentId,
          comment_text: comment.text.slice(0, 1000),
          click_token: token,
        },
        { onConflict: 'automation_id,external_user_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    if (!contact) continue
    try {
      const replies = automation.public_replies.filter(Boolean)
      if (replies.length) {
        const reply = replies[Math.floor(Math.random() * replies.length)]!
        await meta.replyToComment(account.platform as 'instagram' | 'facebook', comment.commentId, reply)
      }
      await meta.sendMessage(pageId, { comment_id: comment.commentId }, dmText(automation, token))
      await admin
        .from('dm_contacts')
        .update({ stage: 'dm_sent', dm_sent_at: new Date().toISOString() })
        .eq('id', contact.id)
      sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Slanje nije uspelo.'
      logger.warn('dm_automation_failed', { automationId: automation.id, error })
      await admin
        .from('dm_contacts')
        .update({ stage: 'failed', error: message.slice(0, 500) })
        .eq('id', contact.id)
      await admin
        .from('dm_automations')
        .update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', automation.id)
    }
  }
  return sent
}

/**
 * Podsetnik: osoba je dobila poruku, nije kliknula, a odgovorila je (pa je razgovor otvoren 24 h).
 * Bez odgovora Meta ne dozvoljava drugu poruku, pa podsetnik ne ide.
 */
export async function runFollowUps(account: SocialAccountRow, fetchImpl?: typeof fetch): Promise<number> {
  if (account.status !== 'active' || !canSend(account, 'message')) return 0
  if (!(await isFeatureEnabledFor(INBOX_FLAG, account.workspace_id))) return 0
  const admin = createSupabaseAdminClient()
  const { data: automations } = await admin
    .from('dm_automations')
    .select('*')
    .eq('social_account_id', account.id)
    .eq('active', true)
    .not('follow_up', 'is', null)
  if (!automations?.length) return 0
  const pageId = account.platform === 'instagram' ? account.external_parent_id : account.external_id
  if (!pageId) return 0
  let meta: MetaInbox | null = null
  let sent = 0
  for (const a of automations) {
    const due = new Date(Date.now() - a.follow_up_hours * 3_600_000).toISOString()
    const { data: contacts } = await admin
      .from('dm_contacts')
      .select('*')
      .eq('automation_id', a.id)
      .eq('stage', 'dm_sent')
      .lte('dm_sent_at', due)
      .limit(MAX_DMS_PER_RUN)
    for (const c of (contacts ?? []) as ContactRow[]) {
      const { data: thread } = await admin
        .from('inbox_threads')
        .select('last_inbound_at')
        .eq('social_account_id', account.id)
        .eq('kind', 'message')
        .eq('author_external_id', c.external_user_id)
        .order('last_inbound_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      const inbound = thread?.last_inbound_at ? Date.parse(thread.last_inbound_at) : 0
      if (!inbound || inbound < Date.parse(c.dm_sent_at!) || Date.now() - inbound > MESSAGING_WINDOW_MS)
        continue
      try {
        meta ??= new MetaInbox(await accessTokenFor(account), { fetchImpl })
        await meta.sendMessage(
          pageId,
          { id: c.external_user_id },
          dmText({ ...a, dm_message: a.follow_up! }, c.click_token),
        )
        await admin
          .from('dm_contacts')
          .update({ stage: 'followed_up', followed_up_at: new Date().toISOString() })
          .eq('id', c.id)
        sent++
      } catch (error) {
        logger.warn('dm_follow_up_failed', { contactId: c.id, error })
      }
    }
  }
  return sent
}

/** Klik na link iz poruke: beleži se prvi klik, pa preusmerenje na link toka. */
export async function recordClick(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null
  const admin = createSupabaseAdminClient()
  const { data: contact } = await admin
    .from('dm_contacts')
    .select('id, stage, clicked_at, dm_automations(link_url)')
    .eq('click_token', token)
    .maybeSingle()
  const url = (contact?.dm_automations as unknown as { link_url: string | null } | null)?.link_url ?? null
  if (!contact || !url) return null
  if (!contact.clicked_at)
    await admin
      .from('dm_contacts')
      .update({ clicked_at: new Date().toISOString(), stage: 'clicked' })
      .eq('id', contact.id)
  return url
}
