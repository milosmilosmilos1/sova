import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as workspacesPost } from '@/app/api/workspaces/route'
import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { purgeExpiredNetworkData } from '@/services/data-retention'

import { admin, call, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Rokovi čuvanja (D-181): YouTube i Google poslovni profil najviše 30 dana od poslednjeg osvežavanja,
 * Inbox razgovor bez nove poruke 12 meseci; ostale mreže i sveži podaci ostaju.
 */
let user: TestUser
let wsId = ''
let brandId = ''
const accounts: Record<'youtube' | 'facebook', string> = { youtube: '', facebook: '' }

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function account(platform: 'youtube' | 'facebook'): Promise<string> {
  const externalId = `${platform}-${crypto.randomUUID().slice(0, 8)}`
  const e = encryptSecret('token', `social:${brandId}:${platform}:${externalId}`)
  const { data, error } = await admin
    .from('social_accounts')
    .insert({
      brand_id: brandId,
      workspace_id: wsId,
      platform,
      external_id: externalId,
      name: platform,
      account_type: platform === 'youtube' ? 'youtube_channel' : 'facebook_page',
      status: 'active',
      capabilities: {},
      metadata: {},
      assisted_only: false,
      access_token_enc: toPgBytea(e.ciphertext),
      key_version: e.keyVersion,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

beforeAll(async () => {
  user = await createTestUser('retention')
  const ws = await call<{ workspaceId: string; brandId: string }>(workspacesPost, '/api/workspaces', {
    token: user.token,
    body: { name: 'Rokovi čuvanja', type: 'business' },
  })
  wsId = ws.json.data!.workspaceId
  brandId = ws.json.data!.brandId
  accounts.youtube = await account('youtube')
  accounts.facebook = await account('facebook')
})

afterAll(async () => {
  await admin.from('workspaces').delete().eq('id', wsId)
  await deleteTestUser(user)
})

describe('rokovi čuvanja podataka sa mreža (D-181)', () => {
  it('briše YouTube podatke neosvežene 30 dana i Inbox razgovore starije od 12 meseci', async () => {
    const post = (accountId: string, id: string, importedAt: string) => ({
      brand_id: brandId,
      social_account_id: accountId,
      external_id: id,
      post_type: 'video',
      metrics: {},
      imported_at: importedAt,
    })
    const hist = await admin
      .from('historical_posts')
      .insert([
        post(accounts.youtube, 'yt-old', daysAgo(31)),
        post(accounts.youtube, 'yt-fresh', daysAgo(2)),
        post(accounts.facebook, 'fb-old', daysAgo(90)),
      ])
    expect(hist.error).toBeNull()
    const daily = (accountId: string, date: string, capturedAt: string) => ({
      brand_id: brandId,
      social_account_id: accountId,
      date,
      captured_at: capturedAt,
    })
    const metrics = await admin
      .from('account_metrics_daily')
      .insert([
        daily(accounts.youtube, daysAgo(40).slice(0, 10), daysAgo(40)),
        daily(accounts.youtube, daysAgo(1).slice(0, 10), daysAgo(1)),
        daily(accounts.facebook, daysAgo(40).slice(0, 10), daysAgo(40)),
      ])
    expect(metrics.error).toBeNull()
    const thread = (externalId: string, lastMessageAt: string) => ({
      workspace_id: wsId,
      brand_id: brandId,
      social_account_id: accounts.facebook,
      platform: 'facebook' as const,
      kind: 'comment',
      external_id: externalId,
      last_message_at: lastMessageAt,
    })
    const { data: threads, error: tErr } = await admin
      .from('inbox_threads')
      .insert([thread('t-old', daysAgo(370)), thread('t-new', daysAgo(30))])
      .select('id, external_id')
    expect(tErr).toBeNull()
    const oldThread = threads!.find((t) => t.external_id === 't-old')!.id
    const msg = await admin.from('inbox_messages').insert({
      thread_id: oldThread,
      brand_id: brandId,
      external_id: 'm-old',
      direction: 'in',
      body: 'stara poruka',
      sent_at: daysAgo(370),
    })
    expect(msg.error).toBeNull()

    const result = await purgeExpiredNetworkData()
    expect(result.historicalPosts).toBeGreaterThanOrEqual(1)
    expect(result.accountMetrics).toBeGreaterThanOrEqual(1)
    expect(result.inboxThreads).toBeGreaterThanOrEqual(1)

    const { data: leftPosts } = await admin
      .from('historical_posts')
      .select('external_id')
      .eq('brand_id', brandId)
    expect(leftPosts!.map((p) => p.external_id).sort()).toEqual(['fb-old', 'yt-fresh'])
    const { data: leftDaily } = await admin
      .from('account_metrics_daily')
      .select('social_account_id, date')
      .eq('brand_id', brandId)
    expect(leftDaily).toHaveLength(2)
    expect(leftDaily!.filter((d) => d.social_account_id === accounts.youtube)).toHaveLength(1)
    const { data: leftThreads } = await admin
      .from('inbox_threads')
      .select('external_id')
      .eq('brand_id', brandId)
    expect(leftThreads!.map((t) => t.external_id)).toEqual(['t-new'])
    const { count } = await admin
      .from('inbox_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', oldThread)
    expect(count).toBe(0)
  })
})
