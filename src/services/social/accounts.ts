import 'server-only'

import { randomBytes } from 'node:crypto'

import type { SocialPlatform } from '@/config/platforms'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { currentKeyVersion, decryptSecret, encryptSecret, sha256Hex, toPgBytea } from '@/lib/crypto/tokens'
import { env } from '@/lib/env'
import { isFeatureEnabled } from '@/lib/flags'
import { enqueueHistoryImport } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import type { ActivateAccountsInput } from '@/lib/schemas/social'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { providerToApiError } from '@/integrations/social/errors'
import {
  connectKeyFor,
  getMetaProvider,
  isProviderConfigured,
  providerFor,
  type ConnectProviderKey,
} from '@/integrations/social/registry'
import type { AccountRef, ExternalAccount, TokenSet } from '@/integrations/social/types'
import { getBrand } from '@/services/brands'
import type { Database, Json } from '@/types/database'

/**
 * Nalozi mreža (docs/ARCHITECTURE.md 3.4): povezivanje kroz OAuth, izbor naloga, tokeni AES-256-GCM
 * u `social_accounts`, čitanje kroz `social_accounts_public` (bez tokena). Faza 8a: Meta (FB + IG).
 */
export type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row']
export type SocialAccountPublic = Database['public']['Views']['social_accounts_public']['Row']

const PENDING_TTL_MS = 60 * 60_000

function aadFor(brandId: string, platform: string, externalId: string): string {
  return `social:${brandId}:${platform}:${externalId}`
}

function callbackUrl(key: ConnectProviderKey): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/integrations/${key}/callback`
}

export interface ConnectAvailability {
  provider: ConnectProviderKey
  configured: boolean
  enabledPlatforms: SocialPlatform[]
}

export async function connectAvailability(): Promise<ConnectAvailability[]> {
  const [fb, ig] = await Promise.all([
    isFeatureEnabled('platform.facebook'),
    isFeatureEnabled('platform.instagram'),
  ])
  const enabled: SocialPlatform[] = []
  if (fb) enabled.push('facebook')
  if (ig) enabled.push('instagram')
  return [{ provider: 'meta', configured: isProviderConfigured('meta'), enabledPlatforms: enabled }]
}

/** Početak OAuth toka: state + redirect; vraća URL mreže. */
export async function beginSocialConnect(
  viewer: Viewer,
  providerKey: string,
  brandId: string,
  redirectTo: string | null,
): Promise<string> {
  const key = connectKeyFor(providerKey)
  if (!key) throw new ApiError('NOT_FOUND', 'Ova mreža još nije podržana.')
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, ADMIN_ROLES)
  if (!isProviderConfigured(key))
    throw new ApiError(
      'AI_UNAVAILABLE',
      'Integracija sa Facebook-om i Instagram-om još nije podešena (nedostaju ključevi aplikacije).',
    )
  const availability = (await connectAvailability()).find((a) => a.provider === key)!
  if (!availability.enabledPlatforms.length)
    throw new ApiError('FORBIDDEN', 'Povezivanje Facebook-a i Instagram-a još nije uključeno.')

  const state = randomBytes(24).toString('base64url')
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('oauth_states').insert({
    state_hash: sha256Hex(state),
    user_id: viewer.user.id,
    workspace_id: brand.workspace_id,
    brand_id: brand.id,
    provider: key,
    redirect_to: redirectTo && redirectTo.startsWith('/') ? redirectTo : '/app/accounts',
  })
  if (error) throw mapDbError(error)
  return getMetaProvider().getAuthUrl({ state, redirectUri: callbackUrl(key) })
}

export interface ConnectCallbackResult {
  redirectTo: string
}

/** Povratak sa mreže: razmena koda, lista naloga, upis kao „na čekanju” do izbora korisnika. */
export async function completeSocialConnect(
  viewer: Viewer,
  providerKey: string,
  params: {
    state: string | null
    code: string | null
    error: string | null
    errorDescription?: string | null
  },
): Promise<ConnectCallbackResult> {
  const key = connectKeyFor(providerKey)
  if (!key) throw new ApiError('NOT_FOUND', 'Ova mreža još nije podržana.')
  const admin = createSupabaseAdminClient()
  if (!params.state) throw new ApiError('VALIDATION', 'Nedostaje state parametar.')
  const stateHash = sha256Hex(params.state)
  const { data: row } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state_hash', stateHash)
    .eq('provider', key)
    .maybeSingle()
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw new ApiError('VALIDATION', 'Povezivanje je isteklo ili je već iskorišćeno. Pokušajte ponovo.')
  }
  if (row.user_id !== viewer.user.id)
    throw new ApiError('FORBIDDEN', 'Povezivanje je pokrenuo drugi korisnik.')
  if (!row.brand_id) throw new ApiError('VALIDATION', 'Povezivanje nema brend.')
  await admin.from('oauth_states').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  const base = (row.redirect_to ?? '/app/accounts').split('?')[0]!
  if (params.error || !params.code) {
    logger.warn('social_oauth_denied', {
      provider: key,
      error: params.error,
      description: params.errorDescription,
    })
    return { redirectTo: `${base}?connect=denied` }
  }

  const provider = getMetaProvider()
  let tokens: TokenSet & { externalUserId: string; externalUserName: string | null }
  let accounts: ExternalAccount[]
  try {
    tokens = await provider.exchangeCode(params.code, { redirectUri: callbackUrl(key) })
    accounts = await provider.listAccounts(tokens)
  } catch (error) {
    throw providerToApiError(error)
  }
  if (!accounts.length) return { redirectTo: `${base}?connect=empty` }

  const { data: existing } = await admin
    .from('social_accounts')
    .select('id, platform, external_id, status, metadata')
    .eq('brand_id', row.brand_id)
    .in('platform', ['facebook', 'instagram'])
  const existingByKey = new Map((existing ?? []).map((a) => [`${a.platform}:${a.external_id}`, a]))

  for (const a of accounts) {
    const aad = aadFor(row.brand_id, a.platform, a.externalId)
    const access = encryptSecret(a.token.accessToken, aad)
    const refresh = a.token.refreshToken ? encryptSecret(a.token.refreshToken, aad) : null
    const prev = existingByKey.get(`${a.platform}:${a.externalId}`)
    const metadata: Record<string, Json> = {
      ...((prev?.metadata as Record<string, Json> | null) ?? {}),
      ...a.metadata,
      metaUserId: tokens.externalUserId,
      metaUserName: tokens.externalUserName,
    }
    const keepActive = prev && prev.status === 'active' && !(metadata.pending === true)
    if (!keepActive) {
      metadata.pending = true
      metadata.pendingState = stateHash
      metadata.pendingAt = new Date().toISOString()
    } else {
      delete metadata.pending
      delete metadata.pendingState
      delete metadata.pendingAt
    }
    const payload = {
      brand_id: row.brand_id,
      workspace_id: row.workspace_id,
      platform: a.platform,
      external_id: a.externalId,
      external_parent_id: a.parentExternalId,
      name: a.name,
      username: a.username,
      avatar_url: a.avatarUrl,
      account_type: a.accountType,
      access_token_enc: toPgBytea(access.ciphertext),
      refresh_token_enc: refresh ? toPgBytea(refresh.ciphertext) : null,
      key_version: access.keyVersion,
      token_expires_at: a.token.expiresAt,
      refresh_token_expires_at: a.token.refreshExpiresAt,
      scopes: tokens.scopes,
      status: (keepActive ? 'active' : 'disabled') as SocialAccountRow['status'],
      status_reason: keepActive ? null : 'Čeka izbor korisnika',
      capabilities: a.capabilities as unknown as NonNullable<Json>,
      metadata: metadata as NonNullable<Json>,
      connected_by: viewer.user.id,
      updated_at: new Date().toISOString(),
    }
    const { error } = await admin
      .from('social_accounts')
      .upsert(payload, { onConflict: 'brand_id,platform,external_id' })
    if (error) throw mapDbError(error)
  }
  logger.info('social_connect_pending', { provider: key, brandId: row.brand_id, accounts: accounts.length })
  return { redirectTo: `${base}?pending=${stateHash}&brand=${row.brand_id}` }
}

export interface SocialAccountView {
  id: string
  platform: SocialPlatform
  externalId: string
  parentExternalId: string | null
  name: string
  username: string | null
  avatarUrl: string | null
  accountType: string
  status: SocialAccountRow['status']
  statusReason: string | null
  capabilities: Record<string, boolean>
  assistedOnly: boolean
  followers: number | null
  pending: boolean
  pendingState: string | null
  tokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  historyCount: number
  createdAt: string
}

function toView(r: SocialAccountPublic, historyCount: number): SocialAccountView {
  const meta = (r.metadata as Record<string, Json> | null) ?? {}
  return {
    id: r.id!,
    platform: r.platform!,
    externalId: r.external_id!,
    parentExternalId: r.external_parent_id ?? null,
    name: r.name!,
    username: r.username ?? null,
    avatarUrl: r.avatar_url ?? null,
    accountType: r.account_type!,
    status: r.status!,
    statusReason: r.status_reason ?? null,
    capabilities: (r.capabilities as Record<string, boolean> | null) ?? {},
    assistedOnly: Boolean(r.assisted_only),
    followers: typeof meta.followers === 'number' ? meta.followers : null,
    pending: meta.pending === true,
    pendingState: typeof meta.pendingState === 'string' ? meta.pendingState : null,
    tokenExpiresAt: r.token_expires_at ?? null,
    refreshTokenExpiresAt: null,
    lastSyncedAt: r.last_synced_at ?? null,
    lastError: r.last_error ?? null,
    historyCount,
    createdAt: r.created_at!,
  }
}

export async function listSocialAccounts(
  viewer: Viewer,
  brandId: string,
  pendingState?: string | null,
): Promise<{
  accounts: SocialAccountView[]
  pending: SocialAccountView[]
  availability: ConnectAvailability[]
}> {
  await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('social_accounts_public')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: true })
  if (error) throw mapDbError(error)
  const rows = data ?? []
  const ids = rows.map((r) => r.id!).filter(Boolean)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: hist } = await viewer.supabase
      .from('historical_posts')
      .select('social_account_id')
      .in('social_account_id', ids)
    for (const h of hist ?? []) counts.set(h.social_account_id, (counts.get(h.social_account_id) ?? 0) + 1)
  }
  const views = rows.map((r) => toView(r, counts.get(r.id!) ?? 0))
  const cutoff = Date.now() - PENDING_TTL_MS
  const pending = views.filter(
    (v) =>
      v.pending &&
      (!pendingState || v.pendingState === pendingState) &&
      new Date(v.createdAt).getTime() > cutoff - 86_400_000,
  )
  return { accounts: views.filter((v) => !v.pending), pending, availability: await connectAvailability() }
}

/** Korisnik bira koje naloge zadržava; ostali „na čekanju” iz istog toka se brišu. */
export async function activateSocialAccounts(
  viewer: Viewer,
  input: ActivateAccountsInput,
): Promise<SocialAccountView[]> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, ADMIN_ROLES)
  const admin = createSupabaseAdminClient()
  const { data: rows, error } = await admin
    .from('social_accounts')
    .select('*')
    .eq('brand_id', brand.id)
    .contains('metadata', { pendingState: input.pendingState })
  if (error) throw mapDbError(error)
  const pendingRows = (rows ?? []).filter(
    (r) => ((r.metadata as Record<string, Json>)?.pending as boolean) === true,
  )
  if (!pendingRows.length) throw new ApiError('NOT_FOUND', 'Nema naloga na čekanju za ovo povezivanje.')
  const chosen = new Set(input.ids)
  const activated: string[] = []
  for (const r of pendingRows) {
    const meta = { ...((r.metadata as Record<string, Json>) ?? {}) }
    delete meta.pending
    delete meta.pendingState
    delete meta.pendingAt
    if (chosen.has(r.id)) {
      const assistedOnly = !(await isFeatureEnabled(`platform.${r.platform}`))
      const { error: upErr } = await admin
        .from('social_accounts')
        .update({
          status: 'active',
          status_reason: null,
          metadata: meta as NonNullable<Json>,
          assisted_only: assistedOnly,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id)
      if (upErr) throw mapDbError(upErr)
      activated.push(r.id)
    } else {
      await admin.from('social_accounts').delete().eq('id', r.id)
    }
  }
  for (const id of activated) {
    try {
      await enqueueHistoryImport(id, brand.id)
    } catch (error) {
      logger.warn('history_import_enqueue_failed', { id, error })
    }
  }
  logger.info('social_accounts_activated', {
    brandId: brand.id,
    activated: activated.length,
    dropped: pendingRows.length - activated.length,
  })
  return (await listSocialAccounts(viewer, brand.id)).accounts.filter((a) => activated.includes(a.id))
}

export async function removeSocialAccount(viewer: Viewer, accountId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin.from('social_accounts').select('*').eq('id', accountId).maybeSingle()
  if (!row) throw new ApiError('NOT_FOUND', 'Nalog ne postoji.')
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, ADMIN_ROLES)
  // opoziv na mreži je najbolji napor; ako je isti korisnički token i na drugim nalozima brenda, ne opozivamo celu aplikaciju
  const { count } = await admin
    .from('social_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', row.brand_id)
    .contains('metadata', { metaUserId: (row.metadata as Record<string, Json>)?.metaUserId ?? '' })
    .neq('id', row.id)
  if ((count ?? 0) === 0 && row.refresh_token_enc) {
    try {
      const tokens = tokensFor(row)
      await providerFor(row.platform).revoke(
        tokens,
        ((row.metadata as Record<string, Json>)?.metaUserId as string) ?? null,
      )
    } catch (error) {
      logger.warn('social_revoke_failed', { accountId, error })
    }
  }
  const { error } = await admin.from('social_accounts').delete().eq('id', accountId)
  if (error) throw mapDbError(error)
}

export function tokensFor(row: SocialAccountRow): TokenSet {
  const aad = aadFor(row.brand_id, row.platform, row.external_id)
  return {
    accessToken: row.access_token_enc
      ? decryptSecret(row.access_token_enc as unknown as string, row.key_version, aad)
      : '',
    refreshToken: row.refresh_token_enc
      ? decryptSecret(row.refresh_token_enc as unknown as string, row.key_version, aad)
      : null,
    expiresAt: row.token_expires_at,
    refreshExpiresAt: row.refresh_token_expires_at,
    scopes: row.scopes,
  }
}

export function refFor(row: SocialAccountRow): AccountRef {
  return {
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    parentExternalId: row.external_parent_id,
    accountType: row.account_type,
    metadata: (row.metadata as Record<string, Json> | null) ?? {},
  }
}

/** Za pozadinske poslove i publisher: red sa tokenima (service role). */
export async function loadAccountRow(accountId: string): Promise<SocialAccountRow | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('social_accounts').select('*').eq('id', accountId).maybeSingle()
  return data
}

export async function markAccountStatus(
  accountId: string,
  status: SocialAccountRow['status'],
  reason: string | null,
  lastError?: string | null,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  await admin
    .from('social_accounts')
    .update({
      status,
      status_reason: reason,
      ...(lastError !== undefined ? { last_error: lastError } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
}

/** Ponovno čitanje podataka naloga sa mreže (ime, avatar, pratioci) + uvoz istorije. */
export async function syncSocialAccount(viewer: Viewer, accountId: string): Promise<SocialAccountView> {
  const row = await loadAccountRow(accountId)
  if (!row) throw new ApiError('NOT_FOUND', 'Nalog ne postoji.')
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (row.status !== 'active') throw new ApiError('CONFLICT', 'Nalog nije aktivan; povežite ga ponovo.')
  const admin = createSupabaseAdminClient()
  try {
    const provider = getMetaProvider()
    const tokens = tokensFor(row)
    const accounts = await provider.listAccounts(tokens)
    const fresh = accounts.find((a) => a.platform === row.platform && a.externalId === row.external_id)
    if (!fresh) {
      await markAccountStatus(
        row.id,
        'disabled',
        'Nalog više nije dostupan kroz vašu Facebook prijavu (promenjen tip naloga ili uklonjena uloga).',
      )
      throw new ApiError(
        'CONFLICT',
        'Nalog više nije dostupan kroz vašu Facebook prijavu. Proverite uloge na stranici pa povežite ponovo.',
      )
    }
    const aad = aadFor(row.brand_id, row.platform, row.external_id)
    const access = encryptSecret(fresh.token.accessToken, aad)
    await admin
      .from('social_accounts')
      .update({
        name: fresh.name,
        username: fresh.username,
        avatar_url: fresh.avatarUrl,
        access_token_enc: toPgBytea(access.ciphertext),
        key_version: access.keyVersion,
        capabilities: fresh.capabilities as unknown as NonNullable<Json>,
        metadata: {
          ...((row.metadata as Record<string, Json>) ?? {}),
          ...fresh.metadata,
        } as NonNullable<Json>,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    await enqueueHistoryImport(row.id, row.brand_id)
  } catch (error) {
    if (error instanceof ApiError) throw error
    const api = providerToApiError(error)
    if (api.code === 'FORBIDDEN') await markAccountStatus(row.id, 'needs_reauth', api.message, api.message)
    throw api
  }
  const { accounts } = await listSocialAccounts(viewer, row.brand_id)
  return accounts.find((a) => a.id === row.id)!
}

export async function listHistory(viewer: Viewer, accountId: string, limit: number) {
  const { data: acc } = await viewer.supabase
    .from('social_accounts_public')
    .select('id, brand_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!acc) throw new ApiError('NOT_FOUND', 'Nalog ne postoji ili nemate pristup.')
  return unwrap(
    await viewer.supabase
      .from('historical_posts')
      .select(
        'id, external_id, post_type, text_content, media, permalink, published_at, metrics, imported_at',
      )
      .eq('social_account_id', accountId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit),
  )
}

export { currentKeyVersion }
