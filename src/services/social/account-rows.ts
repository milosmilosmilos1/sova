import 'server-only'

import { decryptSecret } from '@/lib/crypto/tokens'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { AccountRef, TokenSet } from '@/integrations/social/types'
import type { Database, Json } from '@/types/database'

/**
 * Najniži sloj nad `social_accounts` (service role): dešifrovanje tokena, referenca za providere,
 * čitanje i status. Odvojeno od `accounts.ts` da bi `tokens.ts` i `refresh.ts` mogli da ga koriste
 * bez kružnog uvoza.
 */
export type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row']

/** AAD za AES-256-GCM: token je vezan za brend, mrežu i nalog (ne može se premestiti na drugi red). */
export function aadFor(brandId: string, platform: string, externalId: string): string {
  return `social:${brandId}:${platform}:${externalId}`
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
