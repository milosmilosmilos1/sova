import 'server-only'

import { SOVA_HELP } from '@/content/support/sova-help'
import type { AppLocale } from '@/i18n/config'
import en from '@/i18n/messages/en.json'
import sr from '@/i18n/messages/sr-Latn.json'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildSupportPrompt,
  buildSupportSystemPrompt,
  cleanSupportAnswer,
  SUPPORT_HISTORY,
  supportJsonSchema,
  supportReplySchema,
} from '@/lib/ai/prompts/support'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import type { SupportMessageInput } from '@/lib/schemas/support'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { failGeneration, startGeneration } from '@/services/ai/generations'
import { getBrand } from '@/services/brands'
import { getGuide } from '@/services/guide'
import { createIdea } from '@/services/ideas'
import type { Database, Json } from '@/types/database'

/**
 * Chatbot podrške (D-172) u prozoru „Vodič i podrška”: odgovara samo o Sovi, na osnovu teksta pomoći,
 * i ne troši tokene korisnika (trošak modela se beleži kao 'support_chat'). Pitanja i odgovori se
 * čuvaju 90 dana, da administrator vidi šta korisnici pitaju. Razgovor može da se pošalje podršci kao
 * prijava problema na tabli predloga.
 */
type Row = Database['public']['Tables']['support_messages']['Row']

export interface SupportMessageView {
  id: string
  role: 'user' | 'assistant'
  body: string
  /** odgovor koji predlaže slanje razgovora podršci */
  escalate: boolean
  /** potvrda da je razgovor poslat podršci (prozor je prikazuje na jeziku korisnika) */
  escalated: boolean
  createdAt: string
}

export interface SupportThreadView {
  conversationId: string | null
  messages: SupportMessageView[]
  /** prijava problema napravljena iz razgovora */
  ideaId: string | null
}

/** Najviše pitanja po korisniku u satu; broji se iz baze, jer ograničenje u memoriji važi po serveru. */
export const SUPPORT_HOURLY_LIMIT = 20
/** Razgovor se nastavlja ako je poslednja poruka mlađa od ovoga; inače prozor počinje nov. */
const THREAD_IDLE_MS = 24 * 60 * 60_000
/** Poruke starije od ovoga briše noćni posao. */
export const SUPPORT_RETENTION_DAYS = 90

const STEP_TITLES: Record<AppLocale, Record<string, { title: string }>> = {
  'sr-Latn': sr.guide.steps,
  en: en.guide.steps,
}

const meta = (row: Pick<Row, 'meta'>) => (row.meta ?? {}) as { escalate?: boolean; ideaId?: string }

function toView(row: Row): SupportMessageView {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    body: row.body,
    escalate: Boolean(meta(row).escalate),
    escalated: Boolean(meta(row).ideaId),
    createdAt: row.created_at,
  }
}

async function conversationRows(userId: string, conversationId: string): Promise<Row[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('created_at')
    .limit(200)
  if (error) throw mapDbError(error)
  return data ?? []
}

/** Da li razgovor sa ovim ID-jem već postoji (bilo čiji). */
async function conversationTaken(conversationId: string): Promise<boolean> {
  const { count, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
  if (error) throw mapDbError(error)
  return (count ?? 0) > 0
}

function threadOf(conversationId: string | null, rows: Row[]): SupportThreadView {
  const idea = rows.map((r) => meta(r).ideaId).find(Boolean) ?? null
  return { conversationId, messages: rows.map(toView), ideaId: idea }
}

/**
 * Razgovor za prozor: tačno zadati (samo sopstveni), ili poslednji razgovor korisnika ako mu je
 * poslednja poruka mlađa od dana.
 */
export async function getSupportThread(viewer: Viewer, conversationId?: string): Promise<SupportThreadView> {
  if (conversationId) {
    const rows = await conversationRows(viewer.user.id, conversationId)
    if (!rows.length) throw new ApiError('NOT_FOUND', 'Razgovor ne postoji.')
    return threadOf(conversationId, rows)
  }
  const { data, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .select('conversation_id, created_at')
    .eq('user_id', viewer.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw mapDbError(error)
  if (!data || Date.now() - Date.parse(data.created_at) > THREAD_IDLE_MS)
    return { conversationId: null, messages: [], ideaId: null }
  return threadOf(data.conversation_id, await conversationRows(viewer.user.id, data.conversation_id))
}

async function assertHourlyLimit(userId: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', since)
  if (error) throw mapDbError(error)
  if ((count ?? 0) >= SUPPORT_HOURLY_LIMIT)
    throw new ApiError(
      'RATE_LIMITED',
      'Postavili ste 20 pitanja u poslednjih sat vremena. Pokušajte malo kasnije ili pišite podršci.',
      { retryAfterSec: 600 },
    )
}

async function insertMessage(row: Database['public']['Tables']['support_messages']['Insert']): Promise<Row> {
  const { data, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .insert(row)
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  return data
}

/**
 * Pitanje chatbotu: čuva se pitanje, model odgovara na osnovu teksta pomoći i konteksta brenda
 * (ključni koraci iz vodiča), a odgovor se čuva uz oznaku da li predlaže slanje podršci. Kad model ne
 * odgovori, pitanje ostaje sačuvano (može da se pošalje podršci), a greška ide korisniku.
 */
export async function sendSupportMessage(
  viewer: Viewer,
  input: SupportMessageInput,
  ctx: { requestId?: string } = {},
): Promise<{ conversationId: string; messages: SupportMessageView[] }> {
  const brand = await getBrand(viewer, input.brandId)
  await assertHourlyLimit(viewer.user.id)
  // ID novog razgovora daje prozor, da i pitanje na koje model nije odgovorio može da se pošalje
  // podršci; tuđi razgovor se ne nastavlja
  const conversationId = input.conversationId ?? crypto.randomUUID()
  const history = input.conversationId ? await conversationRows(viewer.user.id, conversationId) : []
  if (input.conversationId && !history.length && (await conversationTaken(conversationId)))
    throw new ApiError('NOT_FOUND', 'Razgovor ne postoji.')
  const guide = await getGuide(viewer, brand.id).catch(() => null)
  const titles = STEP_TITLES[viewer.profile.locale]
  const question = await insertMessage({
    conversation_id: conversationId,
    user_id: viewer.user.id,
    brand_id: brand.id,
    role: 'user',
    body: input.text,
  })

  const { generationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'support_chat',
    // podrška je besplatna (D-172): bez rezervacije tokena i provere naplate
    tokens: 0,
    input: { conversationId, question: input.text.slice(0, 500) },
    requestId: ctx.requestId,
  })
  let answer: Row
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildSupportSystemPrompt(SOVA_HELP),
          prompt: buildSupportPrompt({
            locale: viewer.profile.locale,
            brandName: brand.name,
            steps: guide?.steps.map((s) => ({ title: titles[s.key]?.title ?? s.key, done: s.done })),
            history: history.slice(-SUPPORT_HISTORY).map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              body: m.body,
            })),
            question: input.text,
          }),
          jsonSchema: supportJsonSchema(),
          maxOutputTokens: 1024,
          temperature: 0.3,
          thinking: 'low',
        }),
      { label: 'support-chat' },
    )
    const parsed = supportReplySchema.safeParse(outcome.result.json)
    const body = parsed.success ? cleanSupportAnswer(parsed.data.answer) : ''
    if (!body)
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    answer = await insertMessage({
      conversation_id: conversationId,
      user_id: viewer.user.id,
      brand_id: brand.id,
      role: 'assistant',
      body,
      meta: { escalate: parsed.success && parsed.data.escalate },
    })
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    await createSupabaseAdminClient()
      .from('ai_generations')
      .update({
        status: 'succeeded',
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: { answerId: answer.id, escalate: parsed.success && parsed.data.escalate } as Json,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
        finished_at: new Date().toISOString(),
      })
      .eq('id', generationId)
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, null, api.code, api.message)
    throw api
  }
  return { conversationId, messages: [toView(question), toView(answer)] }
}

/** Razgovor kao tekst prijave: poslednje poruke, najviše 2.000 znakova (granica table predloga). */
export function transcriptOf(rows: Array<Pick<Row, 'role' | 'body'>>, max = 2000): string {
  const lines = rows.map((r) => `${r.role === 'assistant' ? 'Sova' : 'Korisnik'}: ${r.body.trim()}`)
  let text = lines.join('\n\n')
  while (text.length > max && lines.length > 1) {
    lines.shift()
    text = `…\n\n${lines.join('\n\n')}`
  }
  return text.slice(0, max)
}

/**
 * „Pošalji podršci”: razgovor postaje prijava problema na tabli predloga (vidi je administrator
 * platforme i autor), jednom po razgovoru.
 */
export async function escalateSupportConversation(
  viewer: Viewer,
  conversationId: string,
): Promise<{ ideaId: string }> {
  const rows = await conversationRows(viewer.user.id, conversationId)
  if (!rows.length) throw new ApiError('NOT_FOUND', 'Razgovor ne postoji.')
  const existing = rows.map((r) => meta(r).ideaId).find(Boolean)
  if (existing) return { ideaId: existing }
  const asked = rows.filter((r) => r.role === 'user')
  const first = asked[0]?.body ?? rows[0]!.body
  const title = `Podrška: ${first.replace(/\s+/g, ' ').trim()}`.slice(0, 120)
  const idea = await createIdea(viewer, {
    kind: 'bug',
    title: title.length >= 3 ? title : 'Podrška: pitanje iz chatbota',
    body: transcriptOf(rows.filter((r) => !meta(r).ideaId)),
  })
  const last = rows.at(-1)!
  await insertMessage({
    conversation_id: conversationId,
    user_id: viewer.user.id,
    brand_id: last.brand_id,
    role: 'assistant',
    body: 'Razgovor je poslat podršci kao prijava problema. Status pratite u „Predlozi i podrška”.',
    meta: { escalated: true, ideaId: idea.id },
  })
  return { ideaId: idea.id }
}

/** Noćno čišćenje: poruke starije od 90 dana. */
export async function purgeOldSupportMessages(now = new Date()): Promise<{ deleted: number }> {
  const before = new Date(now.getTime() - SUPPORT_RETENTION_DAYS * 24 * 60 * 60_000).toISOString()
  const { count, error } = await createSupabaseAdminClient()
    .from('support_messages')
    .delete({ count: 'exact' })
    .lt('created_at', before)
  if (error) throw mapDbError(error)
  return { deleted: count ?? 0 }
}

export interface AdminSupportConversation {
  conversationId: string
  userEmail: string | null
  brandName: string | null
  startedAt: string
  lastAt: string
  questions: number
  escalated: boolean
  messages: SupportMessageView[]
}

/** Admin panel: poslednji razgovori sa svim porukama, najnoviji prvi. */
export async function listSupportConversations(limit = 50): Promise<AdminSupportConversation[]> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw mapDbError(error)
  const byConversation = new Map<string, Row[]>()
  for (const row of data ?? []) {
    const list = byConversation.get(row.conversation_id) ?? []
    list.push(row)
    byConversation.set(row.conversation_id, list)
  }
  const picked = [...byConversation.entries()].slice(0, limit)
  const userIds = [...new Set(picked.map(([, rows]) => rows[0]!.user_id))]
  const brandIds = [
    ...new Set(picked.flatMap(([, rows]) => rows.map((r) => r.brand_id)).filter(Boolean)),
  ] as string[]
  const [{ data: profiles }, { data: brands }] = await Promise.all([
    userIds.length
      ? admin.from('profiles').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string | null }> }),
    brandIds.length
      ? admin.from('brands').select('id, name').in('id', brandIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]))
  const names = new Map((brands ?? []).map((b) => [b.id, b.name]))
  return picked.map(([conversationId, rows]) => {
    const ordered = [...rows].reverse()
    const brandId = ordered.find((r) => r.brand_id)?.brand_id ?? null
    return {
      conversationId,
      userEmail: emails.get(ordered[0]!.user_id) ?? null,
      brandName: brandId ? (names.get(brandId) ?? null) : null,
      startedAt: ordered[0]!.created_at,
      lastAt: ordered.at(-1)!.created_at,
      questions: ordered.filter((r) => r.role === 'user').length,
      escalated: ordered.some((r) => Boolean(meta(r).ideaId)),
      messages: ordered.map(toView),
    }
  })
}
