import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { providerToApiError } from '@/integrations/social/errors'
import { getTikTokProvider } from '@/integrations/social/registry'
import type { CreatorInfo } from '@/integrations/social/tiktok/provider'
import { getBrand } from '@/services/brands'

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
    return await getTikTokProvider().creatorInfo(await accessTokenFor(row))
  } catch (error) {
    const api = providerToApiError(error)
    if (api.code === 'FORBIDDEN') await markAccountStatus(row.id, 'needs_reauth', api.message, api.message)
    throw api
  }
}
