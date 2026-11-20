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

/**
 * Korisnik je uklonio Sovu na Facebook-u: nalozi tog Meta korisnika prelaze u `revoked`, a tokeni se
 * brišu, jer se više ne smeju koristiti (javna strana „Brisanje podataka” to i kaže). Red naloga
 * ostaje, da korisnik u Sovi vidi da treba ponovo da poveže mrežu.
 */
export async function revokeAccountsForMetaUser(metaUserId: string, reason: string): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('social_accounts')
    .update({
      status: 'revoked',
      status_reason: reason,
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
      refresh_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .in('platform', ['facebook', 'instagram'])
    .contains('metadata', { metaUserId })
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

/**
 * Zahtev Mete za brisanje podataka: nalozi tog Meta korisnika se brišu kao kod „Prekini vezu”, a sa
 * njima kaskadno i tokeni, uvezene objave i metrike. Zahtev se beleži sa kodom potvrde i odmah
 * označava kao izvršen; ranije su nalozi samo opozivani, a podaci ostajali u bazi.
 */
export async function handleMetaDataDeletion(
  signedRequest: string | null,
): Promise<{ url: string; confirmation_code: string }> {
  const payload = verifyMetaSignedRequest(signedRequest)
  const admin = createSupabaseAdminClient()
  const { data: removed, error: deleteError } = await admin
    .from('social_accounts')
    .delete()
    .in('platform', ['facebook', 'instagram'])
    .contains('metadata', { metaUserId: payload.user_id })
    .select('id')
  if (deleteError) throw deleteError
  logger.info('meta_data_deleted', { metaUserId: payload.user_id, accounts: removed?.length ?? 0 })
  const { data, error } = await admin.rpc('request_account_deletion', {
    p_source: 'meta_callback',
    p_external_user_id: payload.user_id,
  })
  if (error) throw error
  const code = (data as { confirmation_code?: string } | null)?.confirmation_code ?? 'nepoznato'
  const { error: doneError } = await admin
    .from('account_deletion_requests')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('confirmation_code', code)
  if (doneError) logger.warn('meta_deletion_status_failed', { code, error: doneError })
  return {
    url: `${env.NEXT_PUBLIC_APP_URL}/data-deletion?code=${encodeURIComponent(code)}`,
    confirmation_code: code,
  }
}
