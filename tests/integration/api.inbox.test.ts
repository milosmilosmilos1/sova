import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { PATCH as automationPatch } from '@/app/api/automations/[id]/route'
import { GET as automationsGet, POST as automationsPost } from '@/app/api/automations/route'
import { GET as inboxGet } from '@/app/api/inbox/route'
import { POST as syncPost } from '@/app/api/inbox/sync/route'
import { POST as replyPost } from '@/app/api/inbox/threads/[id]/reply/route'
import { GET as threadGet } from '@/app/api/inbox/threads/[id]/route'
import { POST as suggestPost } from '@/app/api/inbox/threads/[id]/suggest/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { GET as clickGet } from '@/app/r/[token]/route'
import { resetBreakerForTests } from '@/lib/ai/orchestrator'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { clearFlagCache, INBOX_FLAG, isFeatureEnabledFor, setFeatureFlagForTests } from '@/lib/flags'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { inboxAccountsToSync } from '@/services/inbox/sync'

import { enqueueReply, geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Inbox i DM automatizacija (D-117): sinhronizacija, odgovori, tok sa ključnom reči, klik i podsetnik. */
let user: TestUser
let other: TestUser
let wsId = ''
let brandId = ''
let igId = ''
let fbId = ''
const G = 'https://graph.facebook.com/:version'
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

interface GraphComment {
  id: string
  text: string
  timestamp: string
  from: { id: string; username: string }
  replies?: { data: GraphComment[] }
}

const graph = {
  comments: [] as GraphComment[],
  conversations: [] as unknown[],
  posts: [] as Array<{ id: string; text: string }>,
  replies: [] as Array<{ commentId: string; message: string }>,
  messages: [] as Array<{ page: string; recipient: Record<string, string>; text: string }>,
}

function resetGraph() {
  graph.comments = [
    {
      id: 'c1',
      text: 'Koja je CENA servisa?',
      timestamp: minutesAgo(90),
      from: { id: 'u1', username: 'ana' },
      replies: {
        data: [
          {
            id: 'r1',
            text: 'Poslali smo vam u poruke.',
            timestamp: minutesAgo(80),
            from: { id: 'ig-inbox', username: 'klimaservis' },
          },
        ],
      },
    },
    { id: 'c2', text: 'Super ste!', timestamp: minutesAgo(60), from: { id: 'u2', username: 'marko' } },
    // komentar samog naloga (npr. prvi komentar objave) ne ulazi u Inbox
    {
      id: 'c-self',
      text: 'Link je u biografiji',
      timestamp: minutesAgo(50),
      from: { id: 'ig-inbox', username: 'klimaservis' },
    },
  ]
  graph.conversations = [
    {
      id: 't1',
      updated_time: minutesAgo(30),
      participants: {
        data: [
          { id: 'ig-inbox', username: 'klimaservis' },
          { id: 'u3', username: 'jelena' },
        ],
      },
      messages: {
        data: [
          {
            id: 'mm1',
            message: 'Zdravo, radite li subotom?',
            created_time: minutesAgo(30),
            from: { id: 'u3', username: 'jelena' },
          },
        ],
      },
    },
  ]
  graph.replies = []
  graph.messages = []
}

const handlers = [
  http.get(`${G}/ig-inbox/media`, () =>
    HttpResponse.json({
      data: [
        {
          id: 'm1',
          caption: 'Letnji servis klima',
          permalink: 'https://instagram.test/p/m1',
          comments_count: graph.comments.length,
        },
      ],
    }),
  ),
  http.get(`${G}/m1/comments`, () => HttpResponse.json({ data: graph.comments })),
  http.get(`${G}/page-inbox/conversations`, ({ request }) => {
    const platform = new URL(request.url).searchParams.get('platform')
    return HttpResponse.json({ data: platform === 'instagram' ? graph.conversations : [] })
  }),
  http.get(`${G}/page-inbox/posts`, () => HttpResponse.json({ data: [] })),
  http.get(`${G}/page-inbox/ratings`, () =>
    HttpResponse.json({
      data: [
        {
          created_time: minutesAgo(200),
          recommendation_type: 'positive',
          review_text: 'Brzi i ljubazni, preporuka!',
          reviewer: { id: 'u4', name: 'Petar' },
          open_graph_story: { id: 'story1', comments: { data: [] } },
        },
      ],
    }),
  ),
  http.post(`${G}/:comment/replies`, async ({ request, params }) => {
    const body = new URLSearchParams(await request.text())
    graph.replies.push({ commentId: String(params.comment), message: body.get('message') ?? '' })
    return HttpResponse.json({ id: `reply-${graph.replies.length}` })
  }),
  http.post(`${G}/story1/comments`, async ({ request }) => {
    const body = new URLSearchParams(await request.text())
    graph.replies.push({ commentId: 'story1', message: body.get('message') ?? '' })
    return HttpResponse.json({ id: 'story-reply-1' })
  }),
  http.post(`${G}/page-inbox/messages`, async ({ request }) => {
    const body = new URLSearchParams(await request.text())
    graph.messages.push({
      page: 'page-inbox',
      recipient: JSON.parse(body.get('recipient') ?? '{}') as Record<string, string>,
      text: (JSON.parse(body.get('message') ?? '{}') as { text?: string }).text ?? '',
    })
    return HttpResponse.json({ recipient_id: 'x', message_id: `mid-${graph.messages.length}` })
  }),
]

function enc(platform: string, externalId: string) {
  const e = encryptSecret('page-token-inbox', `social:${brandId}:${platform}:${externalId}`)
  return { access_token_enc: toPgBytea(e.ciphertext), key_version: e.keyVersion }
}

interface Thread {
  id: string
  kind: string
  unread: boolean
  authorName: string | null
  preview: string
  rating: number | null
}
interface InboxData {
  enabled: boolean
  threads: Thread[]
  counts: Record<string, { total: number; unread: number }>
  accounts: Array<{ id: string; platform: string; read: string[]; send: string[] }>
}

const list = (kind: string, token = user.token) =>
  call<InboxData>(inboxGet, '/api/inbox', { token, query: { brandId, kind } })
const sync = () =>
  call<{ threads: number; inserted: number; dms: number; errors: string[] }>(syncPost, '/api/inbox/sync', {
    token: user.token,
    body: { brandId },
  })

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...handlers)
  user = await createTestUser('inbox')
  other = await createTestUser('inbox-other')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Inbox test', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  const base = {
    brand_id: brandId,
    workspace_id: wsId,
    status: 'active' as const,
    capabilities: { publish: true },
    metadata: {},
    assisted_only: false,
  }
  const { data, error } = await admin
    .from('social_accounts')
    .insert([
      {
        ...base,
        platform: 'instagram',
        external_id: 'ig-inbox',
        external_parent_id: 'page-inbox',
        name: 'Klima Servis IG',
        username: 'klimaservis',
        account_type: 'instagram_business',
        scopes: ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages'],
        ...enc('instagram', 'ig-inbox'),
      },
      {
        ...base,
        platform: 'facebook',
        external_id: 'page-inbox',
        name: 'Klima Servis',
        username: null,
        account_type: 'facebook_page',
        scopes: ['pages_read_user_content', 'pages_manage_engagement'],
        ...enc('facebook', 'page-inbox'),
      },
    ])
    .select('id, platform')
  if (error) throw new Error(error.message)
  igId = data!.find((a) => a.platform === 'instagram')!.id
  fbId = data!.find((a) => a.platform === 'facebook')!.id
})

afterEach(() => {
  resetGeminiMock()
  resetBreakerForTests()
  resetMemoryRateLimit()
  setFeatureFlagForTests(INBOX_FLAG, true)
})

afterAll(async () => {
  setFeatureFlagForTests(INBOX_FLAG, null)
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
  await deleteTestUser(other)
})

describe('Inbox', () => {
  it('sinhronizacija: komentari, poruke i preporuke bez duplikata; komentar naloga se preskače', async () => {
    setFeatureFlagForTests(INBOX_FLAG, true)
    resetGraph()
    const before = await list('comment')
    expect(before.json.data).toMatchObject({ enabled: true, threads: [] })
    const ig = before.json.data!.accounts.find((a) => a.id === igId)!
    expect(ig.read.sort()).toEqual(['comment', 'message'])
    const fb = before.json.data!.accounts.find((a) => a.id === fbId)!
    expect(fb.read.sort()).toEqual(['comment', 'review'])
    expect(fb.send).not.toContain('message')

    const first = await sync()
    expect(first.status).toBe(200)
    expect(first.json.data).toMatchObject({ errors: [] })
    expect(first.json.data!.inserted).toBe(5)
    const again = await sync()
    expect(again.json.data!.inserted).toBe(0)

    const comments = (await list('comment')).json.data!
    expect(comments.threads.map((t) => t.authorName).sort()).toEqual(['ana', 'marko'])
    expect(comments.counts).toMatchObject({
      comment: { total: 2, unread: 2 },
      message: { total: 1, unread: 1 },
      review: { total: 1, unread: 1 },
    })
    const reviews = (await list('review')).json.data!
    expect(reviews.threads[0]).toMatchObject({ authorName: 'Petar', preview: 'Brzi i ljubazni, preporuka!' })
  })

  it('razgovor: poruke redom (odgovor naloga je odlazni), otvaranje ga označava kao pročitan', async () => {
    const ana = (await list('comment')).json.data!.threads.find((t) => t.authorName === 'ana')!
    const r = await call<{
      thread: Thread
      messages: Array<{ direction: string; body: string }>
      canReply: boolean
    }>(threadGet, `/api/inbox/threads/${ana.id}`, { token: user.token, params: { id: ana.id } })
    expect(r.json.data!.messages.map((m) => m.direction)).toEqual(['in', 'out'])
    expect(r.json.data!.canReply).toBe(true)
    const after = (await list('comment')).json.data!
    expect(after.counts.comment!.unread).toBe(1)
    expect(
      (await call(threadGet, `/api/inbox/threads/${ana.id}`, { token: other.token, params: { id: ana.id } }))
        .status,
    ).toBe(404)
    expect((await list('comment', other.token)).status).toBe(404)
  })

  it('odgovor ide kroz mrežu: komentar (replies), poruka (recipient id) i preporuka (komentar na priču)', async () => {
    resetGraph()
    const comment = (await list('comment')).json.data!.threads.find((t) => t.authorName === 'ana')!
    const c = await call<{ direction: string; body: string }>(
      replyPost,
      `/api/inbox/threads/${comment.id}/reply`,
      {
        token: user.token,
        params: { id: comment.id },
        body: { text: 'Hvala, javljamo se!' },
      },
    )
    expect(c.status).toBe(200)
    expect(graph.replies).toEqual([{ commentId: 'c1', message: 'Hvala, javljamo se!' }])

    const message = (await list('message')).json.data!.threads[0]!
    const m = await call(replyPost, `/api/inbox/threads/${message.id}/reply`, {
      token: user.token,
      params: { id: message.id },
      body: { text: 'Radimo subotom do 14h.' },
    })
    expect(m.status).toBe(200)
    expect(graph.messages).toEqual([
      { page: 'page-inbox', recipient: { id: 'u3' }, text: 'Radimo subotom do 14h.' },
    ])

    const review = (await list('review')).json.data!.threads[0]!
    expect(
      (
        await call(replyPost, `/api/inbox/threads/${review.id}/reply`, {
          token: user.token,
          params: { id: review.id },
          body: { text: 'Hvala, Petre!' },
        })
      ).status,
    ).toBe(200)
    expect(graph.replies.at(-1)).toEqual({ commentId: 'story1', message: 'Hvala, Petre!' })
    const updated = (await list('message')).json.data!.threads[0]!
    expect(updated.preview).toBe('Radimo subotom do 14h.')
  })

  it('predlog odgovora od Sove košta 1 token', async () => {
    enqueueReply({ kind: 'text', json: { reply: '„Hvala na pitanju! Cene smo vam poslali u poruke.”' } })
    const thread = (await list('comment')).json.data!.threads[0]!
    const r = await call<{ reply: string; tokensCharged: number }>(
      suggestPost,
      `/api/inbox/threads/${thread.id}/suggest`,
      {
        token: user.token,
        method: 'POST',
        params: { id: thread.id },
      },
    )
    expect(r.status).toBe(200)
    expect(r.json.data).toEqual({
      reply: 'Hvala na pitanju! Cene smo vam poslali u poruke.',
      tokensCharged: 1,
    })
  })

  it('bez prekidača: sinhronizacija i odgovor su zabranjeni, a Inbox to kaže', async () => {
    setFeatureFlagForTests(INBOX_FLAG, false)
    expect((await list('comment')).json.data!.enabled).toBe(false)
    expect((await sync()).status).toBe(403)
    expect(await inboxAccountsToSync()).toEqual([])
  })

  it('prekidač za jedan radni prostor kroz rollout.workspaces', async () => {
    setFeatureFlagForTests(INBOX_FLAG, null)
    await admin
      .from('feature_flags')
      .upsert({ key: INBOX_FLAG, enabled: false, rollout: { workspaces: [wsId] } })
    clearFlagCache()
    try {
      expect(await isFeatureEnabledFor(INBOX_FLAG, wsId)).toBe(true)
      expect(await isFeatureEnabledFor(INBOX_FLAG, crypto.randomUUID())).toBe(false)
      expect(await inboxAccountsToSync()).toEqual(expect.arrayContaining([igId, fbId]))
    } finally {
      await admin.from('feature_flags').delete().eq('key', INBOX_FLAG)
      clearFlagCache()
    }
  })
})

describe('DM automatizacija', () => {
  let automationId = ''

  it('tok bez dozvole za poruke se ne uključuje; sa njom se pravi i uključuje', async () => {
    const noMessaging = await call(automationsPost, '/api/automations', {
      token: user.token,
      body: {
        brandId,
        accountId: fbId,
        name: 'FB cena',
        keywords: ['cena'],
        dmMessage: 'Evo cene.',
        active: true,
      },
    })
    expect(noMessaging.status).toBe(400)
    const r = await call<{ id: string; active: boolean; keywords: string[] }>(
      automationsPost,
      '/api/automations',
      {
        token: user.token,
        body: {
          brandId,
          accountId: igId,
          name: 'Cena za leto',
          keywords: ['  „Cena” ', 'cena', 'cenovnik'],
          publicReplies: ['Poslali smo vam poruku!'],
          dmMessage: 'Zdravo! Evo cena za letnji servis.',
          linkUrl: 'https://example.com/akcija',
          linkLabel: 'Rezervišite ovde',
          followUp: 'Da li ste stigli da pogledate?',
          followUpHours: 2,
          active: true,
        },
      },
    )
    expect(r.status).toBe(201)
    expect(r.json.data).toMatchObject({ active: true, keywords: ['Cena', 'cena', 'cenovnik'] })
    automationId = r.json.data!.id
  })

  it('nov komentar sa ključnom reči: javni odgovor i privatna poruka sa linkom, jednom po osobi; stari komentar se ne dira', async () => {
    resetGraph()
    graph.comments.push({
      id: 'c3',
      text: 'ЦЕНА молим',
      timestamp: new Date().toISOString(),
      from: { id: 'u5', username: 'milica' },
    })
    graph.comments.push({
      id: 'c4',
      text: 'cena?',
      timestamp: new Date().toISOString(),
      from: { id: 'u5', username: 'milica' },
    })
    graph.comments.push({
      id: 'c5',
      text: 'Šaljite cenovnik',
      timestamp: new Date().toISOString(),
      from: { id: 'u6', username: 'ivan' },
    })
    const r = await sync()
    expect(r.json.data!.dms).toBe(2)
    expect(graph.replies.map((x) => x.commentId).sort()).toEqual(['c3', 'c5'])
    expect(graph.messages.map((x) => x.recipient)).toEqual([{ comment_id: 'c3' }, { comment_id: 'c5' }])
    expect(graph.messages[0]!.text).toMatch(
      /^Zdravo! Evo cena za letnji servis\.\n\nRezervišite ovde: http.*\/r\/[\w-]+$/,
    )
    // c1 („Koja je CENA servisa?”) je stariji od toka
    expect(graph.replies.find((x) => x.commentId === 'c1')).toBeUndefined()
    const again = await sync()
    expect(again.json.data!.dms).toBe(0)
  })

  it('klik na link beleži kontakt i vodi na link toka; nepoznat link vodi na početnu', async () => {
    const { data: contact } = await admin
      .from('dm_contacts')
      .select('click_token, stage')
      .eq('automation_id', automationId)
      .eq('external_user_id', 'u5')
      .single()
    expect(contact!.stage).toBe('dm_sent')
    const res = await clickGet(new NextRequest(`http://localhost:3001/r/${contact!.click_token}`), {
      params: Promise.resolve({ token: contact!.click_token }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/akcija')
    const bad = await clickGet(new NextRequest('http://localhost:3001/r/nepostoji123'), {
      params: Promise.resolve({ token: 'nepostoji123' }),
    })
    expect(bad.headers.get('location')).toBe('http://localhost:3001/')
    const view = await call<{
      automations: Array<{ id: string; stats: { matches: number; dms: number; clicks: number } }>
      totals: { matches: number; dms: number; clicks: number; active: number }
      contacts: Array<{ username: string; stage: string }>
    }>(automationsGet, '/api/automations', { token: user.token, query: { brandId } })
    expect(view.json.data!.automations.find((a) => a.id === automationId)!.stats).toEqual({
      matches: 2,
      dms: 2,
      clicks: 1,
    })
    expect(view.json.data!.totals).toMatchObject({ matches: 2, dms: 2, clicks: 1, active: 1 })
    expect(view.json.data!.contacts.map((c) => c.stage).sort()).toEqual(['clicked', 'dm_sent'])
  })

  it('podsetnik ide samo osobi koja je odgovorila, a nije kliknula', async () => {
    resetGraph()
    await admin
      .from('dm_contacts')
      .update({ dm_sent_at: minutesAgo(180) })
      .eq('automation_id', automationId)
      .eq('external_user_id', 'u6')
    // ivan je odgovorio u porukama posle poruke toka
    graph.conversations.push({
      id: 't2',
      updated_time: minutesAgo(20),
      participants: {
        data: [
          { id: 'ig-inbox', username: 'klimaservis' },
          { id: 'u6', username: 'ivan' },
        ],
      },
      messages: {
        data: [
          {
            id: 'mm2',
            message: 'Hvala, gledam!',
            created_time: minutesAgo(20),
            from: { id: 'u6', username: 'ivan' },
          },
        ],
      },
    })
    const r = await sync()
    expect(r.json.data!.dms).toBe(1)
    expect(graph.messages).toEqual([
      {
        page: 'page-inbox',
        recipient: { id: 'u6' },
        text: expect.stringContaining('Da li ste stigli da pogledate?'),
      },
    ])
    const { data: contact } = await admin
      .from('dm_contacts')
      .select('stage')
      .eq('automation_id', automationId)
      .eq('external_user_id', 'u6')
      .single()
    expect(contact!.stage).toBe('followed_up')
  })

  it('bez prekidača tok se čuva isključen i ne može da se uključi', async () => {
    setFeatureFlagForTests(INBOX_FLAG, false)
    const off = await call<{ id: string; active: boolean }>(automationsPost, '/api/automations', {
      token: user.token,
      body: { brandId, accountId: igId, name: 'Info', keywords: ['info'], dmMessage: 'Evo informacija.' },
    })
    expect(off.status).toBe(201)
    expect(off.json.data!.active).toBe(false)
    const on = await call(automationPatch, `/api/automations/${off.json.data!.id}`, {
      token: user.token,
      method: 'PATCH',
      params: { id: off.json.data!.id },
      body: { active: true },
    })
    expect(on.status).toBe(403)
    const view = await call<{ enabled: boolean }>(automationsGet, '/api/automations', {
      token: user.token,
      query: { brandId },
    })
    expect(view.json.data!.enabled).toBe(false)
  })
})
