import { assertViewer, createHandler } from '@/lib/api/handler'
import { contentKindsUpdateSchema } from '@/lib/schemas/brand-content'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getBrandContent, setContentKinds } from '@/services/brand-content'

/** Sadržaj brenda (D-165): utisci klijenata, tim, pre i posle i prekidači po vrsti. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getBrandContent(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: contentKindsUpdateSchema,
    rateLimit: { name: 'brand-content', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => setContentKinds(assertViewer(viewer), params.id, body.kinds),
)
