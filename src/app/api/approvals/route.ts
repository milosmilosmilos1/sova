import { assertViewer, createHandler } from '@/lib/api/handler'
import { reviewListQuerySchema } from '@/lib/schemas/review'
import { getReviewDetail, listReviewDesk } from '@/services/posts/review-read'

/**
 * Odobravanje (D-108): nacrti po karticama (čekaju, odobreni, objavljeni, preskočeni, svi). Sa `detail`
 * odgovor nosi i pregled objave koja je otvorena (ili prve na listi), pa pregledač ne šalje drugi zahtev
 * posle liste (D-164). Neuspeo pregled ne obara listu: tada ga pregledač traži sam.
 */
export const GET = createHandler(
  { auth: 'user', query: reviewListQuerySchema },
  async ({ viewer, query }) => {
    const v = assertViewer(viewer)
    const { detail, ...input } = query
    const list = await listReviewDesk(v, input)
    if (!detail) return list
    const id = detail !== 'first' && list.items.some((i) => i.id === detail) ? detail : list.items[0]?.id
    return { ...list, detail: id ? await getReviewDetail(v, id).catch(() => null) : null }
  },
)
