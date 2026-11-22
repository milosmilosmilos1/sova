import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as linksPost } from '@/app/api/approval-links/route'
import { GET as approvalsGet } from '@/app/api/approvals/route'
import { GET as mediaGet } from '@/app/api/media/route'
import { GET as postGet } from '@/app/api/posts/[id]/route'
import { POST as postsPost } from '@/app/api/posts/route'
import { GET as publicGet } from '@/app/api/public/approvals/[token]/route'
import { POST as unsplashSelectPost } from '@/app/api/unsplash/select/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { resetUnsplashCacheForTests } from '@/integrations/unsplash/client'
import { signedUrl } from '@/services/media-urls'

import { geminiServer, resetGeminiMock } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { resetVisualsState, unsplashHandlers, visualsState } from './visuals-mock'

/**
 * Unsplash u prikazu (D-190): fotografija koju je korisnik izabrao prikazuje se sa Unsplash adrese
 * (hotlink), uz autora i Unsplash sa linkovima u biblioteci, editoru i na strani za odobrenje, a za
 * objavu na mreži ide kopija iz skladišta.
 */
let user: TestUser
let wsId = ''
let brandId = ''

interface Credit {
  name: string
  photographerUrl: string
  unsplashUrl: string
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...unsplashHandlers)
  user = await createTestUser('unsplash-display')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Unsplash prikaz', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetVisualsState()
  resetGeminiMock()
  resetMemoryRateLimit()
  resetUnsplashCacheForTests()
})

afterAll(async () => {
  geminiServer.close()
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

/** hotlink na images.unsplash.com sa `ixid` (pravila Unsplash API-ja) */
function expectHotlink(url: string | null | undefined, id = 'a1') {
  const u = new URL(url!)
  expect(u.origin).toBe('https://images.unsplash.com')
  expect(u.pathname).toBe(`/photo-${id}`)
  expect(u.searchParams.get('ixid')).toBeTruthy()
}

function expectCredit(credit: Credit | null | undefined, id = 'a1') {
  expect(credit?.name).toBe(`Fotograf ${id}`)
  expect(credit?.photographerUrl).toBe(`https://unsplash.com/@foto${id}?utm_source=sova&utm_medium=referral`)
  expect(credit?.unsplashUrl).toBe('https://unsplash.com/?utm_source=sova&utm_medium=referral')
}

describe('Unsplash fotografija u prikazu (D-190)', () => {
  it('izbor, biblioteka, editor i strana za odobrenje: hotlink i potpis; objava ide iz skladišta', async () => {
    const picked = await call<{ id: string; url: string }>(unsplashSelectPost, '/api/unsplash/select', {
      token: user.token,
      body: { brandId, photoId: 'a1' },
    })
    expect(picked.status).toBe(200)
    expectHotlink(picked.json.data!.url)
    // preuzimanje se beleži kad korisnik izabere fotografiju
    expect(visualsState.unsplashDownloads).toEqual(['a1'])
    const assetId = picked.json.data!.id

    const library = await call<Array<{ id: string; url: string; credit: Credit | null }>>(
      mediaGet,
      '/api/media',
      { token: user.token, query: { brandId } },
    )
    const item = library.json.data!.find((m) => m.id === assetId)
    expectHotlink(item?.url)
    expectCredit(item?.credit)

    const post = await call<{ id: string }>(postsPost, '/api/posts', {
      token: user.token,
      body: { brandId, masterText: 'Servis klime u Beogradu', media: [{ mediaAssetId: assetId }] },
    })
    expect(post.status).toBe(201)
    const postId = post.json.data!.id
    const view = await call<{ media: Array<{ url: string; credit: Credit | null }> }>(
      postGet,
      `/api/posts/${postId}`,
      { token: user.token, params: { id: postId } },
    )
    expectHotlink(view.json.data!.media[0]!.url)
    expectCredit(view.json.data!.media[0]!.credit)

    // strana za odobrenje (javni link): ista adresa i isti potpis
    await admin.from('posts').update({ status: 'in_review' }).eq('id', postId)
    // Odobravanje: sličica u listi nacrta i pregled objave
    const desk = await call<{
      items: Array<{ id: string; thumb: string | null }>
      detail?: { post: { media: Array<{ url: string; credit: Credit | null }> } } | null
    }>(approvalsGet, `/api/approvals?brandId=${brandId}&tab=waiting&detail=first`, { token: user.token })
    expect(desk.status).toBe(200)
    expectHotlink(desk.json.data!.items.find((i) => i.id === postId)!.thumb!)
    expectHotlink(desk.json.data!.detail!.post.media[0]!.url)
    expectCredit(desk.json.data!.detail!.post.media[0]!.credit)
    const link = await call<{ id: string; url: string }>(linksPost, '/api/approval-links', {
      token: user.token,
      body: { brandId, postIds: [postId], clientLabel: 'Klijent', expiresInDays: 3 },
    })
    expect(link.status).toBe(201)
    const token = link.json.data!.url.split('/approve/')[1]!
    const pub = await call<{ posts: Array<{ media: Array<{ url: string; credit: Credit | null }> }> }>(
      publicGet,
      `/api/public/approvals/${token}`,
      { params: { token } },
    )
    expect(pub.status).toBe(200)
    expectHotlink(pub.json.data!.posts[0]!.media[0]!.url)
    expectCredit(pub.json.data!.posts[0]!.media[0]!.credit)

    // za objavu na mreži ide kopija iz skladišta, ne Unsplash adresa
    const { data: asset } = await admin.from('media_assets').select('*').eq('id', assetId).single()
    expect(asset!.source).toBe('unsplash')
    const forNetwork = await signedUrl(asset!, 24 * 3600)
    expect(new URL(forNetwork).hostname).not.toBe('images.unsplash.com')
    expect(forNetwork).toContain('/storage/')
  })

  it('šablon ne bira Unsplash fotografiju sam po upitu', async () => {
    const { POST: templatePost } = await import('@/app/api/ai/visual/template/route')
    const r = await call(templatePost, '/api/ai/visual/template', {
      token: user.token,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { brandId, headline: 'Letnja akcija', image: { kind: 'unsplash', query: 'klima' } },
    })
    expect(r.status).toBe(400)
    expect(visualsState.unsplashSearches).toBe(0)
  })
})
