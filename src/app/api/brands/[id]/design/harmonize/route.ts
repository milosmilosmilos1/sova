import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getHarmonizeView, requestHarmonize } from '@/services/design/harmonize'

/** Koliko nacrta koji čekaju nije u temi brenda (D-125). */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getHarmonizeView(assertViewer(viewer), params.id),
)

/** „Uskladi nacrte sa temom”: Sova ih crta ponovo u pozadini, sa istim tekstom i fotografijama. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'design-harmonize', limit: 6, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => requestHarmonize(assertViewer(viewer), params.id),
)
