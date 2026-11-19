import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as escalatePost } from '@/app/api/support/chat/escalate/route'
import { GET as threadGet, POST as chatPost } from '@/app/api/support/chat/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { SUPPORT_TAG } from '@/lib/ai/prompts/support'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import {
  listSupportConversations,
  purgeOldSupportMessages,
  SUPPORT_HOURLY_LIMIT,
} from '@/services/support/chat'

import { calls, enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Chatbot podrške (D-172): odgovara na osnovu teksta pomoći, ne troši tokene, čuva razgovor (korisnik
 * vidi samo svoj), broji 20 pitanja na sat iz baze, a razgovor može da pošalje podršci kao prijavu
 * problema. Noćni posao briše poruke starije od 90 dana.
 */
let owner: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let otherBrandId = ''
const workspaces: string[] = []

interface Message {
  id: string
  role: 'user' | 'assistant'
  body: string
  escalate: boolean
  escalated: boolean
}
interface Sent {
  conversationId: string
  messages: Message[]
}
interface Thread {
  conversationId: string | null
  messages: Message[]
  ideaId: string | null
}

const asUser = (token: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

async function workspaceFor(user: TestUser, name: string) {
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name, type: 'business' },
  })
  workspaces.push(ws.json.data!.workspaceId)
  return ws.json.data!
}

const ask = (user: TestUser, body: Record<string, unknown>) =>
  call<Sent>(chatPost, '/api/support/chat', { token: user.token, body })

const lastPrompt = () => JSON.stringify(calls.at(-1)?.body ?? '')

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  owner = await createTestUser('support')
  other = await createTestUser('support-other')
  const ws = await workspaceFor(owner, 'Podrška test')
  wsId = ws.workspaceId
  brandId = ws.brandId
  otherBrandId = (await workspaceFor(other, 'Podrška drugi')).brandId
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
})

afterAll(async () => {
  geminiServer.close()
  for (const id of workspaces) await admin.from('workspaces').delete().eq('id', id)
  await deleteTestUser(owner)
  await deleteTestUser(other)
})

describe('chatbot podrške (D-172)', () => {
  let conversationId = ''

  it('odgovara na osnovu teksta pomoći, čuva razgovor i ne troši tokene', async () => {
    enqueueReply({
      kind: 'text',
      json: {
        answer: '## Povezivanje\n\n**Otvorite** podešavanja naloga.\n\n\n1. Kliknite „Poveži”.',
        escalate: false,
      },
    })
    conversationId = crypto.randomUUID()
    const r = await ask(owner, { brandId, conversationId, text: 'Kako da povežem Instagram?' })
    expect(r.status).toBe(200)
    expect(r.json.data!.conversationId).toBe(conversationId)
    const [question, answer] = r.json.data!.messages
    expect(question).toMatchObject({ role: 'user', body: 'Kako da povežem Instagram?' })
    // markdown se skida, a višak praznih redova se sažima
    expect(answer).toMatchObject({
      role: 'assistant',
      body: 'Povezivanje\n\nOtvorite podešavanja naloga.\n\n1. Kliknite „Poveži”.',
      escalate: false,
    })
    // model dobija oznaku poziva, tekst pomoći, korake vodiča i pitanje
    const prompt = lastPrompt()
    expect(prompt).toContain(SUPPORT_TAG)
    expect(prompt).toContain('<<<ZNANJE>>>')
    expect(prompt).toContain('KLJUČNI KORACI BRENDA')
    expect(prompt).toContain('Kako da povežem Instagram?')

    const { data: rows } = await admin
      .from('support_messages')
      .select('role, brand_id')
      .eq('conversation_id', conversationId)
    expect(rows!.map((m) => m.role).sort()).toEqual(['assistant', 'user'])
    expect(rows!.every((m) => m.brand_id === brandId)).toBe(true)
    const { data: gen } = await admin
      .from('ai_generations')
      .select('status, tokens_charged, workspace_id, provider_input_tokens')
      .eq('type', 'support_chat')
      .eq('user_id', owner.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(gen).toMatchObject({ status: 'succeeded', workspace_id: wsId })
    expect(gen!.tokens_charged ?? 0).toBe(0)
  })

  it('nastavak razgovora nosi ranija pitanja i odgovore; prozor dobija poslednji razgovor', async () => {
    enqueueReply({ kind: 'text', json: { answer: 'Da, posle povezivanja.', escalate: false } })
    const r = await ask(owner, { brandId, conversationId, text: 'A Facebook stranica?' })
    expect(r.status).toBe(200)
    const prompt = lastPrompt()
    expect(prompt).toContain('RANIJE PORUKE RAZGOVORA')
    expect(prompt).toContain('Korisnik: Kako da povežem Instagram?')

    const thread = await call<Thread>(threadGet, '/api/support/chat', { token: owner.token })
    expect(thread.json.data!.conversationId).toBe(conversationId)
    expect(thread.json.data!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it('tuđi razgovor se ne vidi i ne nastavlja; baza daje korisniku samo njegove poruke', async () => {
    const read = await call<Thread>(threadGet, '/api/support/chat', {
      token: other.token,
      query: { conversationId },
    })
    expect(read.status).toBe(404)
    const cont = await ask(other, { brandId: otherBrandId, conversationId, text: 'Šta je ovde pisalo?' })
    expect(cont.status).toBe(404)
    // ni tuđi brend kao kontekst
    expect((await ask(other, { brandId, text: 'Pitanje' })).status).toBe(404)

    const { data: mine } = await asUser(owner.token).from('support_messages').select('id')
    const { data: theirs } = await asUser(other.token).from('support_messages').select('id')
    expect(mine!.length).toBeGreaterThanOrEqual(4)
    expect(theirs).toEqual([])
  })

  it('kad model ne odgovori, pitanje ostaje i razgovor ide podršci kao prijava problema, jednom', async () => {
    // bez odgovora u redu lažni Gemini vraća JSON koji nije po šemi chatbota
    const id = crypto.randomUUID()
    const r = await ask(owner, { brandId, conversationId: id, text: 'Ne mogu da platim karticom' })
    expect(r.status).toBeGreaterThanOrEqual(500)
    expect(r.json.error!.code).toBe('AI_UNAVAILABLE')
    const { data: kept } = await admin.from('support_messages').select('role').eq('conversation_id', id)
    expect(kept!.map((m) => m.role)).toEqual(['user'])

    const sent = await call<{ ideaId: string }>(escalatePost, '/api/support/chat/escalate', {
      token: owner.token,
      body: { conversationId: id },
    })
    expect(sent.status).toBe(200)
    const { data: idea } = await admin
      .from('feature_requests')
      .select('kind, title, body, author_id')
      .eq('id', sent.json.data!.ideaId)
      .single()
    expect(idea).toMatchObject({
      kind: 'bug',
      author_id: owner.id,
      title: 'Podrška: Ne mogu da platim karticom',
    })
    expect(idea!.body).toContain('Korisnik: Ne mogu da platim karticom')

    const again = await call<{ ideaId: string }>(escalatePost, '/api/support/chat/escalate', {
      token: owner.token,
      body: { conversationId: id },
    })
    expect(again.json.data!.ideaId).toBe(sent.json.data!.ideaId)
    const thread = await call<Thread>(threadGet, '/api/support/chat', {
      token: owner.token,
      query: { conversationId: id },
    })
    expect(thread.json.data!.ideaId).toBe(sent.json.data!.ideaId)
    expect(thread.json.data!.messages.at(-1)).toMatchObject({ role: 'assistant', escalated: true })
    // tuđi razgovor se ne šalje
    const foreign = await call(escalatePost, '/api/support/chat/escalate', {
      token: other.token,
      body: { conversationId: id },
    })
    expect(foreign.status).toBe(404)
  })

  it('najviše 20 pitanja na sat po korisniku, brojano iz baze; starija ne računaju', async () => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    // grupni upis traži iste ključeve u svakom redu
    const { error } = await admin.from('support_messages').insert([
      ...Array.from({ length: SUPPORT_HOURLY_LIMIT - 1 }, (_, i) => ({
        conversation_id: id,
        user_id: other.id,
        role: 'user',
        body: `pitanje ${i}`,
        created_at: now,
      })),
      { conversation_id: id, user_id: other.id, role: 'user', body: 'staro', created_at: old },
    ])
    expect(error).toBeNull()
    enqueueReply({ kind: 'text', json: { answer: 'Odgovor.', escalate: false } })
    // devetnaest u poslednjem satu: dvadeseto prolazi
    expect((await ask(other, { brandId: otherBrandId, text: 'Dvadeseto pitanje' })).status).toBe(200)
    const over = await ask(other, { brandId: otherBrandId, text: 'Dvadeset prvo' })
    expect(over.status).toBe(429)
    expect(over.json.error!.code).toBe('RATE_LIMITED')
  })

  it('prazno pitanje se ne šalje', async () => {
    const r = await ask(owner, { brandId, text: '   ' })
    expect(r.status).toBe(400)
  })

  it('administrator vidi razgovore, sa emailom i oznakom da je poslat podršci', async () => {
    const list = await listSupportConversations(200)
    const first = list.find((c) => c.conversationId === conversationId)
    expect(first).toMatchObject({ userEmail: owner.email, questions: 2, escalated: false })
    expect(list.some((c) => c.userEmail === owner.email && c.escalated)).toBe(true)
  })

  it('poruke starije od 90 dana briše noćni posao', async () => {
    const id = crypto.randomUUID()
    const { error } = await admin.from('support_messages').insert([
      {
        conversation_id: id,
        user_id: owner.id,
        role: 'user',
        body: 'staro pitanje',
        created_at: new Date(Date.now() - 91 * 24 * 60 * 60_000).toISOString(),
      },
      {
        conversation_id: id,
        user_id: owner.id,
        role: 'user',
        body: 'novo pitanje',
        created_at: new Date().toISOString(),
      },
    ])
    expect(error).toBeNull()
    const { deleted } = await purgeOldSupportMessages()
    expect(deleted).toBeGreaterThanOrEqual(1)
    const { data: left } = await admin.from('support_messages').select('body').eq('conversation_id', id)
    expect(left!.map((m) => m.body)).toEqual(['novo pitanje'])
  })
})
