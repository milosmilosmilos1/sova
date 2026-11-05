import 'server-only'

import { randomBytes } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { currentKeyVersion, decryptSecret, encryptSecret, sha256Hex, toPgBytea } from '@/lib/crypto/tokens'
import { env } from '@/lib/env'
import { isFeatureEnabledFor } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import {
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  FIGMA_SCOPES,
  isFigmaConfigured,
  refreshAccessToken,
} from '@/integrations/figma/client'

/**
 * Figma veza po (workspace, korisnik) (D-161), kao Canva: PKCE state u `oauth_states`, tokeni
 * AES-256-GCM u `figma_connections`. Pristup važi 90 dana i obnavlja se dva dana pre isteka istim
 * refresh tokenom. Dok Figma ne odobri aplikaciju, prekidač `figma` je uključen samo za radne
 * prostore iz `rollout.workspaces`.
 */
export const FIGMA_FLAG = 'figma'
const REFRESH_BEFORE_MS = 2 * 86_400_000

export interface FigmaStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
  status: 'active' | 'needs_reauth' | 'disabled' | 'revoked' | null
  expiresAt: string | null
}

function callbackUrl(): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/integrations/figma/callback`
}

export async function getFigmaStatus(viewer: Viewer, workspaceId: string): Promise<FigmaStatus> {
  await requireMembership(viewer, workspaceId)
  const enabled = await isFeatureEnabledFor(FIGMA_FLAG, workspaceId)
  const { data } = await viewer.supabase
    .from('figma_connections')
    .select('status, token_expires_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', viewer.user.id)
    .maybeSingle()
  return {
    configured: isFigmaConfigured(),
    enabled,
    connected: Boolean(data && data.status === 'active'),
    status: (data?.status as FigmaStatus['status']) ?? null,
    expiresAt: data?.token_expires_at ?? null,
  }
}

/** Pravi state + PKCE, čuva ih i vraća adresu za Figma prijavu. */
export async function beginFigmaConnect(
  viewer: Viewer,
  workspaceId: string,
  redirectTo: string | null,
): Promise<string> {
  await requireMembership(viewer, workspaceId, EDIT_ROLES)
  if (!isFigmaConfigured())
    throw new ApiError('AI_UNAVAILABLE', 'Figma integracija nije podešena (nedostaju ključevi).')
  if (!(await isFeatureEnabledFor(FIGMA_FLAG, workspaceId)))
    throw new ApiError('FORBIDDEN', 'Uvoz iz Figme još nije uključen za ovaj radni prostor.')
  const { verifier, challenge } = createPkce()
  const state = randomBytes(24).toString('base64url')
  const enc = encryptSecret(verifier, `figma:${viewer.user.id}`)
  const { error } = await createSupabaseAdminClient()
    .from('oauth_states')
    .insert({
      state_hash: sha256Hex(state),
      user_id: viewer.user.id,
      workspace_id: workspaceId,
      provider: 'figma',
      code_verifier_enc: toPgBytea(enc.ciphertext),
      redirect_to: redirectTo && redirectTo.startsWith('/') ? redirectTo : '/app/settings?figma=connected',
    })
  if (error) throw mapDbError(error)
  return buildAuthorizeUrl({ challenge, state, redirectUri: callbackUrl() })
}

/** Povratak iz Figme: proverava state, menja kod za tokene, upisuje vezu. */
export async function completeFigmaConnect(
  viewer: Viewer,
  params: { state: string | null; code: string | null; error: string | null },
): Promise<{ redirectTo: string }> {
  const admin = createSupabaseAdminClient()
  if (!params.state) throw new ApiError('VALIDATION', 'Nedostaje state parametar.')
  const { data: row } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state_hash', sha256Hex(params.state))
    .eq('provider', 'figma')
    .maybeSingle()
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now())
    throw new ApiError('VALIDATION', 'Povezivanje je isteklo ili je već iskorišćeno. Pokušajte ponovo.')
  if (row.user_id !== viewer.user.id)
    throw new ApiError('FORBIDDEN', 'Povezivanje je pokrenuo drugi korisnik.')
  await admin.from('oauth_states').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  const redirectTo = row.redirect_to ?? '/app/settings'
  if (params.error || !params.code) {
    logger.warn('figma_oauth_denied', { error: params.error })
    return { redirectTo: `${redirectTo.split('?')[0]}?figma=denied` }
  }
  if (!row.code_verifier_enc) throw new ApiError('INTERNAL', 'Nedostaje PKCE verifier.')
  const verifier = decryptSecret(
    row.code_verifier_enc as unknown as string,
    currentKeyVersion(),
    `figma:${viewer.user.id}`,
  )
  const tokens = await exchangeCode({ code: params.code, codeVerifier: verifier, redirectUri: callbackUrl() })
  if (!tokens.refreshToken) throw new ApiError('PROVIDER_ERROR', 'Figma nije izdala token za obnovu veze.')
  await saveTokens({
    workspaceId: row.workspace_id!,
    userId: viewer.user.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    figmaUserId: tokens.userId ?? 'unknown',
  })
  logger.info('figma_connected', { workspaceId: row.workspace_id })
  return { redirectTo }
}

async function saveTokens(input: {
  workspaceId: string
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  figmaUserId?: string
}): Promise<void> {
  const aad = `figma:${input.workspaceId}:${input.userId}`
  const access = encryptSecret(input.accessToken, aad)
  const refresh = encryptSecret(input.refreshToken, aad)
  const { error } = await createSupabaseAdminClient()
    .from('figma_connections')
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        figma_user_id: input.figmaUserId ?? 'unknown',
        access_token_enc: toPgBytea(access.ciphertext),
        refresh_token_enc: toPgBytea(refresh.ciphertext),
        key_version: access.keyVersion,
        token_expires_at: input.expiresAt,
        scopes: [...FIGMA_SCOPES],
        status: 'active' as const,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,user_id' },
    )
  if (error) throw mapDbError(error)
}

/** Važeći pristup za korisnika u radnom prostoru; obnavlja ga dva dana pre isteka. */
export async function getFigmaAccessToken(workspaceId: string, userId: string): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin
    .from('figma_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row || row.status !== 'active')
    throw new ApiError('FORBIDDEN', 'Figma nije povezana za vaš nalog. Povežite je u podešavanjima.')
  const aad = `figma:${workspaceId}:${userId}`
  if (new Date(row.token_expires_at).getTime() - Date.now() > REFRESH_BEFORE_MS)
    return decryptSecret(row.access_token_enc as unknown as string, row.key_version, aad)
  const refreshToken = decryptSecret(row.refresh_token_enc as unknown as string, row.key_version, aad)
  try {
    const tokens = await refreshAccessToken(refreshToken)
    await saveTokens({
      workspaceId,
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
      figmaUserId: row.figma_user_id,
    })
    return tokens.accessToken
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN')
      await admin.from('figma_connections').update({ status: 'needs_reauth' }).eq('id', row.id)
    throw error
  }
}

export async function disconnectFigma(viewer: Viewer, workspaceId: string): Promise<void> {
  await requireMembership(viewer, workspaceId, EDIT_ROLES)
  const { error } = await createSupabaseAdminClient()
    .from('figma_connections')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', viewer.user.id)
  if (error) throw mapDbError(error)
}
