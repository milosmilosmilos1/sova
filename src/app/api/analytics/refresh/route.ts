import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { refreshMetricsSchema } from '@/lib/schemas/analytics'
import { unwrap } from '@/lib/supabase/errors'
import { capturePostMetrics } from '@/services/analytics/metrics'
import { getBrand } from '@/services/brands'

/** Ručno osvežavanje metrika jedne objave (snimak `adhoc`), 10 u minutu. */
export const POST = createHandler(
  {
    auth: 'verified',
    body: refreshMetricsSchema,
    rateLimit: { name: 'analytics-refresh', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => {
    const v = assertViewer(viewer)
    const target = unwrap(
      await v.supabase.from('post_targets').select('id, brand_id').eq('id', body.targetId).maybeSingle(),
      'Target ne postoji ili nemate pristup.',
    )
    const brand = await getBrand(v, target.brand_id)
    await requireMembership(v, brand.workspace_id, EDIT_ROLES)
    const result = await capturePostMetrics(body.targetId, 'adhoc')
    if (result.status === 'failed') throw new ApiError('PROVIDER_ERROR', result.reason)
    return result
  },
)
