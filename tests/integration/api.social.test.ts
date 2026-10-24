import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/jobs/enqueue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/jobs/enqueue')>()
  return { ...mod, enqueueHistoryImport: vi.fn(async () => {}) }
})

import { NextRequest } from 'next/server'

import { GET as callbackGet } from '@/app/api/integrations/[provider]/callback/route'
import { GET as connectGet } from '@/app/api/integrations/[provider]/connect/route'
import { DELETE as accountDelete } from '@/app/api/social-accounts/[id]/route'
import { GET as historyGet } from '@/app/api/social-accounts/[id]/history/route'
import { POST as syncPost } from '@/app/api/social-accounts/[id]/sync/route'
import { POST as activatePost } from '@/app/api/social-accounts/activate/route'
import { GET as accountsGet } from '@/app/api/social-accounts/route'
import { POST as deletionPost } from '@/app/api/webhooks/meta/data-deletion/route'
import { POST as deauthPost } from '@/app/api/webhooks/meta/route'
import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { setFeatureFlagForTests } from '@/lib/flags'
import { enqueueHistoryImport } from '@/lib/jobs/enqueue'
import { resetMemoryRateLimit } from '@/lib/ratelimit'
import { makeSignedRequest } from '@/integrations/social/meta/signed-request'
import { getMetaProvider, setMetaProviderForTests } from '@/integrations/social/registry'
import type { NormalizedPost } from '@/integrations/social/types'
import { loadAccountRow, refFor, tokensFor } from '@/services/social/accounts'
import { importAccountHistory } from '@/services/social/history'
import { refreshExpiringTokens } from '@/services/social/refresh'

import { geminiServer } from './gemini-mock'
import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'
import { metaHandlers, metaState, resetMetaState } from './meta-mock'

let user: TestUser
let brandId = ''
let pendingState = ''
let fbAccountId = ''
let igAccountId = ''
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const SECRET = process.env.META_APP_SECRET!

interface AccountView {
  id: string
  platform: string
  name: string
  status: string
  pending: boolean
  pendingState: string | null
  capabilities: Record<string, boolean>
  assistedOnly: boolean
  followers: number | null
  historyCount: number
  statusReason: string | null
}
interface ListResponse {
  accounts: AccountView[]
  pending: AccountView[]
  availability: Array<{ provider: string; configured: boolean; enabledPlatforms: string[] }>
}

function authed(path: string): NextRequest {
  return new NextRequest(new URL(path, APP), {
    headers: { authorization: `Bearer ${user.token}`, origin: APP },
  })
}

async function list(pending?: string): Promise<ListResponse> {
  const r = await call<ListResponse>(accountsGet, '/api/social-accounts', {
    token: user.token,
    query: { brandId, ...(pending ? { pending } : {}) },
  })
  return r.json.data!
}

beforeAll(async () => {
  geminiServer.listen({ onUnhandledFrame: 'bypass' })
  geminiServer.use(...metaHandlers)
  setMetaProviderForTests({ pollIntervalMs: 0, pollAttempts: 2 })
  setFeatureFlagForTests('platform.facebook', true)
  setFeatureFlagForTests('platform.instagram', false)
  user = await createTestUser('soc')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Mreže test', type: 'business' },
  })
  brandId = ws.json.data!.brandId
})

afterEach(() => {
  resetMetaState()
  resetMemoryRateLimit()
})

afterAll(async () => {
  setMetaProviderForTests(null)
  setFeatureFlagForTests('platform.facebook', null)
  setFeatureFlagForTests('platform.instagram', null)
  geminiServer.close()
  await deleteTestUser(user)
})

describe('Meta povezivanje', () => {
  it('connect: state u bazi i 302 na Facebook dialog sa scope-ovima', async () => {
    const empty = await list()
    expect(empty.accounts).toEqual([])
    expect(empty.availability[0]).toMatchObject({
      provider: 'meta',
      configured: true,
      enabledPlatforms: ['facebook'],
    })
    const res = await connectGet(
      authed(`/api/integrations/facebook/connect?brandId=${brandId}&redirectTo=/app/accounts`),
      { params: Promise.resolve({ provider: 'facebook' }) },
    )
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth')
    expect(loc.searchParams.get('client_id')).toBe(process.env.META_APP_ID)
    expect(loc.searchParams.get('scope')).toContain('instagram_content_publish')
    expect(loc.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/meta/callback`)
    pendingState = loc.searchParams.get('state')!
    const unknown = await connectGet(authed(`/api/integrations/tiktok/connect?brandId=${brandId}`), {
      params: Promise.resolve({ provider: 'tiktok' }),
    })
    expect(unknown.status).toBe(404)
  })

  it('callback: razmena koda → dugotrajan token → stranice i IG nalozi na čekanju', async () => {
    const res = await callbackGet(
      authed(`/api/integrations/meta/callback?state=${pendingState}&code=good-code`),
      { params: Promise.resolve({ provider: 'meta' }) },
    )
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/app/accounts')
    const pending = loc.searchParams.get('pending')!
    expect(pending).toHaveLength(64)
    expect(metaState.tokenExchanges.map((t) => t.grant_type ?? 'code')).toEqual(['code', 'fb_exchange_token'])
    const data = await list(pending)
    expect(data.accounts).toEqual([])
    expect(data.pending.map((p) => `${p.platform}:${p.name}`).sort()).toEqual([
      'facebook:Druga strana (samo čitanje)',
      'facebook:Fixture Studio',
      'instagram:Fixture Studio',
    ])
    const readOnly = data.pending.find((p) => p.name.startsWith('Druga'))!
    expect(readOnly.capabilities.publish).toBe(false)
    expect(data.pending.find((p) => p.platform === 'instagram')!.followers).toBe(860)
    pendingState = pending
    const { data: rows } = await admin
      .from('social_accounts')
      .select('status, access_token_enc, metadata')
      .eq('brand_id', brandId)
    expect(rows!.every((r) => r.status === 'disabled' && String(r.access_token_enc).startsWith('\\x'))).toBe(
      true,
    )
    expect((rows![0]!.metadata as { metaUserId: string }).metaUserId).toBe('fb-user-77')
    const replay = await callbackGet(
      authed(`/api/integrations/meta/callback?state=${pendingState}&code=good-code`),
      { params: Promise.resolve({ provider: 'meta' }) },
    )
    expect(replay.status).toBe(400)
  })

  it('izbor naloga aktivira izabrane, briše ostale, Instagram je asistiran (flag isključen), uvoz zakazan', async () => {
    const data = await list(pendingState)
    const fb = data.pending.find((p) => p.platform === 'facebook' && p.name === 'Fixture Studio')!
    const ig = data.pending.find((p) => p.platform === 'instagram')!
    const r = await call<AccountView[]>(activatePost, '/api/social-accounts/activate', {
      token: user.token,
      body: { brandId, pendingState, ids: [fb.id, ig.id] },
    })
    expect(r.status).toBe(200)
    expect(r.json.data!.map((a) => a.platform).sort()).toEqual(['facebook', 'instagram'])
    fbAccountId = fb.id
    igAccountId = ig.id
    const after = await list()
    expect(after.pending).toEqual([])
    expect(after.accounts).toHaveLength(2)
    expect(after.accounts.find((a) => a.platform === 'facebook')).toMatchObject({
      status: 'active',
      assistedOnly: false,
    })
    expect(after.accounts.find((a) => a.platform === 'instagram')).toMatchObject({
      status: 'active',
      assistedOnly: true,
    })
    expect(vi.mocked(enqueueHistoryImport)).toHaveBeenCalledTimes(2)
    const again = await call(activatePost, '/api/social-accounts/activate', {
      token: user.token,
      body: { brandId, pendingState, ids: [fb.id] },
    })
    expect(again.status).toBe(404)
  })

  it('uvoz istorije puni historical_posts idempotentno; token 190 → needs_reauth', async () => {
    expect(await importAccountHistory(fbAccountId)).toMatchObject({ status: 'imported', imported: 2 })
    expect(await importAccountHistory(igAccountId)).toMatchObject({ status: 'imported', imported: 1 })
    expect(await importAccountHistory(fbAccountId)).toMatchObject({ status: 'imported', imported: 2 })
    const { count } = await admin
      .from('historical_posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
    expect(count).toBe(3)
    const h = await call<Array<{ external_id: string; metrics: Record<string, number> }>>(
      historyGet,
      `/api/social-accounts/${fbAccountId}/history`,
      { token: user.token, params: { id: fbAccountId }, query: { limit: '10' } },
    )
    expect(h.json.data![0]).toMatchObject({ external_id: 'page-1_102' })
    expect(h.json.data![1]!.metrics).toMatchObject({ likes: 12, comments: 3, shares: 1 })
    const data = await list()
    expect(data.accounts.find((a) => a.id === fbAccountId)!.historyCount).toBe(2)

    await admin
      .from('social_accounts')
      .update({ access_token_enc: (await loadAccountRow(igAccountId))!.access_token_enc })
      .eq('id', igAccountId)
    // pokvaren token: menjamo šifrovani Page token na vrednost koju mock odbija (preko sync-a sa nevidljivim stranicama)
    metaState.pagesVisible = false
    const sync = await call(syncPost, `/api/social-accounts/${igAccountId}/sync`, {
      method: 'POST',
      token: user.token,
      params: { id: igAccountId },
    })
    expect(sync.status).toBe(409)
    const { data: row } = await admin
      .from('social_accounts')
      .select('status, status_reason')
      .eq('id', igAccountId)
      .single()
    expect(row!.status).toBe('disabled')
    expect(row!.status_reason).toMatch(/više nije dostupan/)
    await admin
      .from('social_accounts')
      .update({ status: 'active', status_reason: null })
      .eq('id', igAccountId)
  })

  it('provider: objava na Facebook (tekst, slika, karusel) i Instagram (kontejner → publish → permalink), validacija', async () => {
    const provider = getMetaProvider()
    const fbRow = (await loadAccountRow(fbAccountId))!
    const igRow = (await loadAccountRow(igAccountId))!
    const fbRef = refFor(fbRow)
    const igRef = refFor(igRow)
    const fbToken = tokensFor(fbRow).accessToken
    expect(fbToken).toBe('page-token-1')

    const text: NormalizedPost = {
      text: 'Zdravo svima',
      link: 'https://fixture-site.test/',
      media: [],
      firstComment: 'Prvi komentar',
      isAiGenerated: false,
      clientKey: 'k1',
    }
    const r1 = await provider.publish(text, fbRef, fbToken)
    expect(r1.externalId).toBe('page-1_901')
    expect(r1.permalink).toBe('https://www.facebook.com/page-1_901')
    expect(metaState.publishes[0]).toMatchObject({
      path: 'page-1/feed',
      body: { message: 'Zdravo svima', link: 'https://fixture-site.test/' },
    })
    expect(metaState.publishes[1]!.path).toBe('page-1_901/comments')

    const photo: NormalizedPost = {
      ...text,
      link: null,
      media: [
        { url: 'https://cdn.test/a.jpg', mimeType: 'image/jpeg', width: 1080, height: 1080, alt: 'Slika' },
      ],
      firstComment: null,
    }
    const r2 = await provider.publish(photo, fbRef, fbToken)
    expect(r2.externalId).toMatch(/^page-1_photo-/)

    const carousel: NormalizedPost = {
      ...photo,
      media: [photo.media[0]!, { ...photo.media[0]!, url: 'https://cdn.test/b.jpg' }],
    }
    const r3 = await provider.publish(carousel, fbRef, fbToken)
    const feed = metaState.publishes.find((p) => p.path === 'page-1/feed' && p.body['attached_media[0]'])!
    expect(JSON.parse(feed.body['attached_media[1]']!)).toHaveProperty('media_fbid')
    expect(r3.externalId).toMatch(/^page-1_/)

    const ig: NormalizedPost = { ...photo, text: 'IG objava #sova', isAiGenerated: true }
    const r4 = await provider.publish(ig, igRef, fbToken)
    expect(r4.externalId).toMatch(/^ig-post-/)
    expect(r4.permalink).toMatch(/instagram\.com\/p\//)
    const container = metaState.publishes.find((p) => p.path === 'ig-1/media')!
    expect(container.body).toMatchObject({
      image_url: 'https://cdn.test/a.jpg',
      caption: 'IG objava #sova',
      alt_text: 'Slika',
      is_ai_generated: 'true',
    })

    metaState.containerStatus = 'IN_PROGRESS'
    const r5 = await provider.publish(ig, igRef, fbToken)
    expect(r5.externalId).toBeNull()
    expect(r5.pending).toMatchObject({ kind: 'ig_container', accountExternalId: 'ig-1' })
    metaState.containerStatus = 'FINISHED'
    const status = await provider.getPublishStatus(r5.pending!, fbToken)
    expect(status).toMatchObject({ state: 'published' })

    const bad: NormalizedPost = {
      ...photo,
      media: [{ ...photo.media[0]!, url: 'https://cdn.test/bad-image.jpg' }],
    }
    await expect(provider.publish(bad, igRef, fbToken)).rejects.toMatchObject({ code: 'MEDIA_REJECTED' })

    expect(provider.validatePost({ ...text, media: [] }, igRef).problems.join(' ')).toMatch(/bar jednu sliku/)
    expect(
      provider
        .validatePost({ ...photo, media: [{ ...photo.media[0]!, mimeType: 'image/png' }] }, igRef)
        .problems.join(' '),
    ).toMatch(/JPEG/)
    expect(
      provider
        .validatePost({ ...photo, media: [{ ...photo.media[0]!, width: 1000, height: 300 }] }, fbRef)
        .problems.join(' '),
    ).toMatch(/Odnos stranica/)
    expect(provider.validatePost(photo, fbRef).ok).toBe(true)

    const m = await provider.fetchPostMetrics('page-1_901', fbRef, fbToken)
    expect(m).toMatchObject({ likes: 9, comments: 1, shares: 2, impressions: 200, reach: 201 })
    const im = await provider.fetchPostMetrics('ig-post-1', igRef, fbToken)
    expect(im).toMatchObject({ likes: 5, comments: 1, reach: 100 })
    const am = await provider.fetchAccountMetrics(igRef, fbToken, '2026-10-20')
    expect(am.followers).toBe(101)
    await provider.deletePost('page-1_901', fbToken)
    expect(metaState.deletes).toContain('page-1_901')
    expect(await provider.findExistingPost(text, fbRef, fbToken)).toBeNull()
  })

  it('osvežavanje tokena produžava korisnički token i obnavlja Page token; istekao → needs_reauth', async () => {
    await admin
      .from('social_accounts')
      .update({ refresh_token_expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString() })
      .eq('brand_id', brandId)
    metaState.pageToken = 'page-token-NEW'
    const s = await refreshExpiringTokens(7)
    expect(s).toMatchObject({ checked: 2, refreshed: 2, needsReauth: 0 })
    expect(metaState.tokenExchanges[0]).toMatchObject({ grant_type: 'fb_exchange_token' })
    const row = (await loadAccountRow(fbAccountId))!
    expect(tokensFor(row).accessToken).toBe('page-token-NEW')
    expect(new Date(row.refresh_token_expires_at!).getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000)

    await admin
      .from('social_accounts')
      .update({ refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .eq('brand_id', brandId)
    metaState.userTokenValid = false
    const s2 = await refreshExpiringTokens(7)
    expect(s2.needsReauth).toBe(2)
    const after = await list()
    expect(after.accounts.every((a) => a.status === 'needs_reauth')).toBe(true)
    await admin
      .from('social_accounts')
      .update({ status: 'active', status_reason: null })
      .eq('brand_id', brandId)
  })

  it('Meta webhook-ovi: deauthorize opoziva naloge, data deletion vraća url i kod; loš potpis 403', async () => {
    const bad = await deauthPost(
      new NextRequest(new URL('/api/webhooks/meta', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signed_request: 'x.y' }),
      }),
      { params: Promise.resolve({}) },
    )
    expect(bad.status).toBe(403)
    const form = new URLSearchParams({
      signed_request: makeSignedRequest(
        { user_id: 'fb-user-77', algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000) },
        SECRET,
      ),
    })
    const ok = await deauthPost(
      new NextRequest(new URL('/api/webhooks/meta', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
      { params: Promise.resolve({}) },
    )
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { data: { revoked: number } }).data.revoked).toBe(2)
    const after = await list()
    expect(after.accounts.every((a) => a.status === 'revoked')).toBe(true)

    const del = await deletionPost(
      new NextRequest(new URL('/api/webhooks/meta/data-deletion', APP), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
      { params: Promise.resolve({}) },
    )
    expect(del.status).toBe(200)
    const body = (await del.json()) as { url: string; confirmation_code: string }
    expect(body.confirmation_code).toHaveLength(16)
    expect(body.url).toBe(`${APP}/data-deletion?code=${body.confirmation_code}`)
    const { data: req } = await admin
      .from('account_deletion_requests')
      .select('source, external_user_id, status')
      .eq('confirmation_code', body.confirmation_code)
      .single()
    expect(req).toMatchObject({ source: 'meta_callback', external_user_id: 'fb-user-77', status: 'pending' })
  })

  it('prekid veze briše nalog i uvezene objave (kaskada)', async () => {
    const r = await call<{ removed: boolean }>(accountDelete, `/api/social-accounts/${igAccountId}`, {
      method: 'DELETE',
      token: user.token,
      params: { id: igAccountId },
    })
    expect(r.status).toBe(200)
    const { count } = await admin
      .from('historical_posts')
      .select('id', { count: 'exact', head: true })
      .eq('social_account_id', igAccountId)
    expect(count).toBe(0)
    const after = await list()
    expect(after.accounts.map((a) => a.id)).toEqual([fbAccountId])
    const missing = await call(accountDelete, `/api/social-accounts/${igAccountId}`, {
      method: 'DELETE',
      token: user.token,
      params: { id: igAccountId },
    })
    expect(missing.status).toBe(404)
  })
})
