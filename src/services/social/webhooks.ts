import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/integrations/social/meta/signed-request'

/**
 * Meta callback-ovi (docs/INTEGRATIONS.md 3): deauthorize (korisnik uklonio Sovu) i data deletion
 * (zahtev za brisanje, odgovor sa URL-om statusa i kodom potvrde).
 */
function requireSecret(): string {
  if (!env.META_APP_SECRET) throw new ApiError('AI_UNAVAILABLE', 'Meta integracija nije podešena.')
  return env.META_APP_SECRET
}

export function verifyMetaSignedRequest(signedRequest: string | null) {
  if (!signedRequest) throw new ApiError('VALIDATION', 'Nedostaje signed_request.')
  const payload = parseSignedRequest(signedRequest, requireSecret())
  if (!payload) throw new ApiError('FORBIDDEN', 'Potpis zahteva nije ispravan.')
  return payload
}

/** Svi nalozi povezani tim Meta korisnikom prelaze u `revoked`. */
export async function revokeAccountsForMetaUser(metaUserId: string, reason: string): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('social_accounts')
    .update({ status: 'revoked', status_reason: reason, updated_at: new Date().toISOString() })
    .in('platform', ['facebook', 'instagram'])
    .contains('metadata', { metaUserId })
    .neq('status', 'revoked')
    .select('id')
  if (error) throw error
  const count = data?.length ?? 0
  logger.info('meta_accounts_revoked', { metaUserId, count, reason })
  return count
}

export async function handleMetaDeauthorize(signedRequest: string | null): Promise<{ revoked: number }> {
  const payload = verifyMetaSignedRequest(signedRequest)
  const revoked = await revokeAccountsForMetaUser(
    payload.user_id,
    'Korisnik je uklonio Sovu u Facebook podešavanjima.',
  )
  return { revoked }
}

export async function handleMetaDataDeletion(
  signedRequest: string | null,
): Promise<{ url: string; confirmation_code: string }> {
  const payload = verifyMetaSignedRequest(signedRequest)
  const admin = createSupabaseAdminClient()
  await revokeAccountsForMetaUser(payload.user_id, 'Zahtev za brisanje podataka sa Facebook-a.')
  const { data, error } = await admin.rpc('request_account_deletion', {
    p_source: 'meta_callback',
    p_external_user_id: payload.user_id,
  })
  if (error) throw error
  const code = (data as { confirmation_code?: string } | null)?.confirmation_code ?? 'nepoznato'
  return {
    url: `${env.NEXT_PUBLIC_APP_URL}/data-deletion?code=${encodeURIComponent(code)}`,
    confirmation_code: code,
  }
}
