import 'server-only'

import { randomBytes } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { currentKeyVersion, decryptSecret, encryptSecret, sha256Hex, toPgBytea } from '@/lib/crypto/tokens'
import { env } from '@/lib/env'
import { isFeatureEnabled } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import {
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  getMe,
  isCanvaConfigured,
  probeAutofill,
  refreshAccessToken,
  type TokenSet,
} from '@/integrations/canva/client'

/**
 * Canva Connect veza po (workspace, korisnik): PKCE state u `oauth_states`, tokeni AES-256-GCM
 * u `canva_connections`, osvežavanje pre isteka (refresh token je jednokratan, pa se nov odmah upisuje).
 */
export const CANVA_FLAG = 'canva'

export interface CanvaStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
  status: 'active' | 'needs_reauth' | 'disabled' | 'revoked' | null
  autofillAvailable: boolean
  canvaUserId: string | null
  expiresAt: string | null
}

function callbackUrl(): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/integrations/canva/callback`
}

export async function getCanvaStatus(viewer: Viewer, workspaceId: string): Promise<CanvaStatus> {
  await requireMembership(viewer, workspaceId)
  const enabled = await isFeatureEnabled(CANVA_FLAG)
  const { data } = await viewer.supabase
    .from('canva_connections_public')
    .select('status, autofill_available, canva_user_id, token_expires_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', viewer.user.id)
    .maybeSingle()
  return {
    configured: isCanvaConfigured(),
    enabled,
    connected: Boolean(data && data.status === 'active'),
    status: (data?.status as CanvaStatus['status']) ?? null,
    autofillAvailable: Boolean(data?.autofill_available),
    canvaUserId: data?.canva_user_id ?? null,
    expiresAt: data?.token_expires_at ?? null,
  }
}

/** Pravi state + PKCE, čuva ih i vraća URL za Canva autorizaciju. */
export async function beginCanvaConnect(
  viewer: Viewer,
  workspaceId: string,
  redirectTo: string | null,
): Promise<string> {
  await requireMembership(viewer, workspaceId, EDIT_ROLES)
  if (!isCanvaConfigured())
    throw new ApiError('AI_UNAVAILABLE', 'Canva integracija nije podešena (nedostaju ključevi).')
  if (!(await isFeatureEnabled(CANVA_FLAG)))
    throw new ApiError('FORBIDDEN', 'Canva integracija još nije uključena.')
  const { verifier, challenge } = createPkce()
  const state = randomBytes(24).toString('base64url')
  const enc = encryptSecret(verifier, `canva:${viewer.user.id}`)
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('oauth_states').insert({
    state_hash: sha256Hex(state),
    user_id: viewer.user.id,
    workspace_id: workspaceId,
    provider: 'canva',
    code_verifier_enc: toPgBytea(enc.ciphertext),
    redirect_to: redirectTo && redirectTo.startsWith('/') ? redirectTo : '/app/settings?canva=connected',
  })
  if (error) throw mapDbError(error)
  return buildAuthorizeUrl({ challenge, state, redirectUri: callbackUrl() })
}

export interface CanvaCallbackResult {
  redirectTo: string
}

/** Callback iz Canve: proverava state, menja kod za tokene, upisuje vezu. */
export async function completeCanvaConnect(
  viewer: Viewer,
  params: { state: string | null; code: string | null; error: string | null },
): Promise<CanvaCallbackResult> {
  const admin = createSupabaseAdminClient()
  if (!params.state) throw new ApiError('VALIDATION', 'Nedostaje state parametar.')
  const { data: row } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state_hash', sha256Hex(params.state))
    .eq('provider', 'canva')
    .maybeSingle()
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw new ApiError('VALIDATION', 'Povezivanje je isteklo ili je već iskorišćeno. Pokušajte ponovo.')
  }
  if (row.user_id !== viewer.user.id)
    throw new ApiError('FORBIDDEN', 'Povezivanje je pokrenuo drugi korisnik.')
  await admin.from('oauth_states').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  const redirectTo = row.redirect_to ?? '/app/settings'
  if (params.error || !params.code) {
    logger.warn('canva_oauth_denied', { error: params.error })
    return { redirectTo: `${redirectTo.split('?')[0]}?canva=denied` }
  }
  if (!row.code_verifier_enc) throw new ApiError('INTERNAL', 'Nedostaje PKCE verifier.')
  const verifier = decryptSecret(
    row.code_verifier_enc as unknown as string,
    currentKeyVersion(),
    `canva:${viewer.user.id}`,
  )
  const tokens = await exchangeCode({ code: params.code, codeVerifier: verifier, redirectUri: callbackUrl() })
  const me = await getMe(tokens.accessToken)
  const autofill = await probeAutofill(tokens.accessToken)
  await saveTokens({
    workspaceId: row.workspace_id,
    userId: viewer.user.id,
    tokens,
    canvaUserId: me.userId,
    teamId: me.teamId,
    autofillAvailable: autofill,
  })
  logger.info('canva_connected', { workspaceId: row.workspace_id, autofill })
  return { redirectTo }
}

async function saveTokens(input: {
  workspaceId: string
  userId: string
  tokens: TokenSet
  canvaUserId?: string
  teamId?: string | null
  autofillAvailable?: boolean
}): Promise<void> {
  const admin = createSupabaseAdminClient()
  const aad = `canva:${input.workspaceId}:${input.userId}`
  const access = encryptSecret(input.tokens.accessToken, aad)
  const refresh = encryptSecret(input.tokens.refreshToken, aad)
  const base = {
    access_token_enc: toPgBytea(access.ciphertext),
    refresh_token_enc: toPgBytea(refresh.ciphertext),
    key_version: access.keyVersion,
    token_expires_at: input.tokens.expiresAt,
    scopes: input.tokens.scopes,
    status: 'active' as const,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('canva_connections').upsert(
    {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      canva_user_id: input.canvaUserId ?? 'unknown',
      team_id: input.teamId ?? null,
      autofill_available: input.autofillAvailable ?? false,
      ...base,
    },
    { onConflict: 'workspace_id,user_id' },
  )
  if (error) throw mapDbError(error)
}

/** Važeći access token za korisnika u workspace-u; osvežava ga 2 min pre isteka. */
export async function getCanvaAccessToken(workspaceId: string, userId: string): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin
    .from('canva_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row || row.status !== 'active') {
    throw new ApiError('FORBIDDEN', 'Canva nije povezana za vaš nalog. Povežite je u podešavanjima.')
  }
  const aad = `canva:${workspaceId}:${userId}`
  const expiresIn = new Date(row.token_expires_at).getTime() - Date.now()
  if (expiresIn > 120_000)
    return decryptSecret(row.access_token_enc as unknown as string, row.key_version, aad)
  const refreshToken = decryptSecret(row.refresh_token_enc as unknown as string, row.key_version, aad)
  try {
    const tokens = await refreshAccessToken(refreshToken)
    await saveTokens({ workspaceId, userId, tokens })
    return tokens.accessToken
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN') {
      await admin.from('canva_connections').update({ status: 'needs_reauth' }).eq('id', row.id)
    }
    throw error
  }
}

export async function disconnectCanva(viewer: Viewer, workspaceId: string): Promise<void> {
  await requireMembership(viewer, workspaceId, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('canva_connections')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', viewer.user.id)
  if (error) throw mapDbError(error)
}
