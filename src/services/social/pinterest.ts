import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { providerToApiError } from '@/integrations/social/errors'
import type { PinterestBoard } from '@/integrations/social/pinterest/provider'
import { getPinterestProvider } from '@/integrations/social/registry'
import { getBrand } from '@/services/brands'

import { loadAccountRow, markAccountStatus } from './account-rows'
import { accessTokenFor } from './tokens'

/**
 * Table Pinterest naloga za izbor u editoru. Čitaju se uživo pri svakom otvaranju, jer pravila
 * Pinterest-a ne dozvoljavaju čuvanje podataka iz API-ja (D-085); u objavi ostaje samo izabrana tabla.
 */
export async function getPinterestBoards(viewer: Viewer, accountId: string): Promise<PinterestBoard[]> {
  const row = await loadAccountRow(accountId)
  if (!row || row.platform !== 'pinterest') throw new ApiError('NOT_FOUND', 'Pinterest nalog ne postoji.')
  const brand = await getBrand(viewer, row.brand_id)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (row.status !== 'active')
    throw new ApiError('CONFLICT', 'Pinterest nalog nije aktivan; povežite ga ponovo.')
  try {
    return await getPinterestProvider().listBoards(await accessTokenFor(row))
  } catch (error) {
    const api = providerToApiError(error)
    if (api.code === 'FORBIDDEN') await markAccountStatus(row.id, 'needs_reauth', api.message, api.message)
    throw api
  }
}
