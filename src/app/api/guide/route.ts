import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { getGuide } from '@/services/guide'

/** Vodič (D-115): ključni koraci brenda za plutajući prozor „Vodič i podrška”. */
export const GET = createHandler(
  { auth: 'user', query: z.object({ brandId: z.uuid() }) },
  async ({ viewer, query }) => getGuide(assertViewer(viewer), query.brandId),
)
