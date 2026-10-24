import 'server-only'

import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { ProviderError } from '@/integrations/social/errors'
import { providerFor } from '@/integrations/social/registry'
import type { TokenSet } from '@/integrations/social/types'

import { aadFor, loadAccountRow, tokensFor, type SocialAccountRow } from './account-rows'

/**
 * Važeći pristupni token za poziv mreže (publisher, istorija, metrike, sinhronizacija). TikTok token
 * traje 24 h i osvežava se pre isteka; LinkedIn traje 60 dana i bez programskog refresh-a posle
 * isteka traži ponovno povezivanje (D-076). Meta Page tokeni nemaju fiksan istek.
 */
const TIKTOK_MARGIN_MS = 10 * 60_000

export async function accessTokenFor(row: SocialAccountRow): Promise<string> {
  const tokens = tokensFor(row)
  const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null
  if (row.platform === 'tiktok' && exp !== null && exp - Date.now() < TIKTOK_MARGIN_MS) {
    return (await refreshAccountTokens(row)).accessToken
  }
  if (row.platform === 'linkedin' && exp !== null && exp <= Date.now()) {
    if (tokens.refreshToken) return (await refreshAccountTokens(row)).accessToken
    throw new ProviderError('TOKEN_INVALID', {
      message: 'LinkedIn token je istekao (60 dana).',
      userMessage: 'LinkedIn veza je istekla. Povežite nalog ponovo.',
    })
  }
  return tokens.accessToken
}

/**
 * Osvežavanje i upis. TikTok pri osvežavanju može da vrati nov refresh token, a stari tada više ne
 * važi; ako je drugi proces upravo osvežio isti nalog, koristi se njegovo stanje iz baze.
 */
export async function refreshAccountTokens(row: SocialAccountRow): Promise<TokenSet> {
  const current = tokensFor(row)
  let fresh: TokenSet
  try {
    fresh = await providerFor(row.platform).refreshUserToken(current)
  } catch (error) {
    const latest = await loadAccountRow(row.id)
    if (
      latest?.token_expires_at &&
      latest.token_expires_at !== row.token_expires_at &&
      new Date(latest.token_expires_at).getTime() > Date.now() + 60_000
    ) {
      return tokensFor(latest)
    }
    throw error
  }
  await saveAccountTokens(row, { ...fresh, refreshToken: fresh.refreshToken ?? current.refreshToken })
  return fresh
}

/** Oba tokena se šifruju istom (aktuelnom) verzijom ključa, jer red ima jedan `key_version`. */
export async function saveAccountTokens(row: SocialAccountRow, tokens: TokenSet): Promise<void> {
  const aad = aadFor(row.brand_id, row.platform, row.external_id)
  const access = encryptSecret(tokens.accessToken, aad)
  const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken, aad) : null
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('social_accounts')
    .update({
      access_token_enc: toPgBytea(access.ciphertext),
      refresh_token_enc: refresh ? toPgBytea(refresh.ciphertext) : null,
      key_version: access.keyVersion,
      token_expires_at: tokens.expiresAt,
      refresh_token_expires_at: tokens.refreshExpiresAt,
      ...(tokens.scopes.length ? { scopes: tokens.scopes } : {}),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) throw mapDbError(error)
  row.token_expires_at = tokens.expiresAt
}
