import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { contentListParamSchema } from '@/lib/schemas/brand-content'
import { addContentItem } from '@/services/brand-content'

/** Nova stavka liste (utisak klijenta, član tima, par pre i posle); oblik tela proverava servis po listi. */
export const POST = createHandler(
  {
    auth: 'user',
    params: contentListParamSchema,
    body: z.unknown(),
    rateLimit: { name: 'brand-content', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => addContentItem(assertViewer(viewer), params.id, params.list, body),
)
