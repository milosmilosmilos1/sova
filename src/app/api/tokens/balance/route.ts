import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { requireMembership } from '@/lib/auth/workspace'
import { getTokenPrices } from '@/lib/tokens/prices'
import { getTokenBalance } from '@/lib/tokens/reservation'

/** Stanje tokena i važeći cenovnik akcija za workspace. */
export const GET = createHandler(
  { auth: 'user', query: z.object({ workspaceId: z.uuid() }) },
  async ({ viewer, query }) => {
    const v = assertViewer(viewer)
    await requireMembership(v, query.workspaceId)
    const [balance, prices] = await Promise.all([getTokenBalance(query.workspaceId), getTokenPrices()])
    return { balance, prices }
  },
)
