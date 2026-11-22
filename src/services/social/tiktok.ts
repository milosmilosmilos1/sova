import 'server-only'

import { TIKTOK_MAX_DURATION_KEY } from '@/config/tiktok'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { providerToApiError } from '@/integrations/social/errors'
import { getTikTokProvider } from '@/integrations/social/registry'
import type { CreatorInfo } from '@/integrations/social/tiktok/provider'
import { getBrand } from '@/services/brands'
import type { Json } from '@/types/database'

import { loadAccountRow, markAccountStatus } from './account-rows'
import { accessTokenFor } from './tokens'

/**
 * Podaci o TikTok nalogu za panel u editoru (UX smernice za Direct Post): nadimak, dozvoljene
 * privatnosti i interakcije. Čita se svaki put pre izbora podešavanja, jer ih korisnik menja u
 * TikTok aplikaciji.
 */
export async function getTikTokCreatorInfo(viewer: Viewer, accountId: string): Promise<CreatorInfo> {
  const row = await loadAccountRow(accountId)
  if (!row || row.platform !== 'tiktok') throw new ApiError('NOT_FOUND', 'TikTok nalog ne postoji.')
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (row.status !== 'active')
    throw new ApiError('CONFLICT', 'TikTok nalog nije aktivan; povežite ga ponovo.')
  try {
    const info = await getTikTokProvider().creatorInfo(await accessTokenFor(row))
    await rememberMaxDuration(row.id, row.metadata, info.maxVideoPostDurationSec)
    return info
  } catch (error) {
    const api = providerToApiError(error)
    if (api.code === 'FORBIDDEN') await markAccountStatus(row.id, 'needs_reauth', api.message, api.message)
    throw api
  }
}

/**
 * Najduži dozvoljen video ide uz nalog, da provera pre zakazivanja (bez poziva TikTok-a) odbije predug
 * video (D-188). Upis samo kad se vrednost promeni; neuspeh upisa ne obara panel.
 */
async function rememberMaxDuration(accountId: string, metadata: Json, maxSec: number | null): Promise<void> {
  const current = (
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  ) as Record<string, Json>
  if ((current[TIKTOK_MAX_DURATION_KEY] ?? null) === maxSec) return
  const { error } = await createSupabaseAdminClient()
    .from('social_accounts')
    .update({ metadata: { ...current, [TIKTOK_MAX_DURATION_KEY]: maxSec } })
    .eq('id', accountId)
  if (error) logger.warn('tiktok_max_duration_save_failed', { accountId, error: error.message })
}
